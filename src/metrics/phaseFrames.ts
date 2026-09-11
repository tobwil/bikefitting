import { unwrapDeltaDeg } from '../pedal/geometry.ts'
import type { BikeCalibration } from '../types/calibration.ts'
import type { CameraNearSide, PoseFrame } from '../types/landmarks.ts'
import type { MetricMethod, MetricsCycle, MetricsFrame } from '../types/metrics.ts'
import type { ResultSource } from '../types/result.ts'
import {
  PHASE_EVIDENCE_SCHEMA_VERSION,
  PHASE_IDS,
  PHASE_SELECTION_METHOD,
  PHASE_TARGET_DEG,
  PHASE_WINDOW_HALF_DEG,
  type PhaseEvidence,
  type PhaseFrameEvidence,
  type PhaseFrameMetrics,
  type PhaseId,
  type PhaseImage,
  type PhaseMarks,
  type PhasePoseSnapshot,
  type PhaseRepresentativeCycle,
  type PhaseSlot,
} from '../types/phase.ts'
import { sampleMetricDegrees, sagittalJoints } from './angles.ts'
import { BDC_ANGLE_DEG, BDC_WINDOW_HALF_DEG, estimateAtBdc, type BdcSample } from './bdc.ts'
import { detectCycles, pedalAngleDeg } from './cycles.ts'
import { DEFAULT_METRICS_OPTIONS } from './pipeline.ts'
import { median } from './stats.ts'

export const PHASE_LABEL_DE: Record<PhaseId, string> = {
  tdc: 'Oberer Totpunkt',
  forward: 'Vorne',
  bdc: 'Unterer Totpunkt',
  back: 'Hinten',
}

export function crankDistanceDeg(fromDeg: number, toDeg: number): number {
  return Math.abs(unwrapDeltaDeg(fromDeg, toDeg))
}

export function inPhaseWindow(
  angleDeg: number,
  targetDeg: number,
  windowHalfDeg = PHASE_WINDOW_HALF_DEG,
): boolean {
  return crankDistanceDeg(angleDeg, targetDeg) <= windowHalfDeg
}

function cloneMarks(calibration: BikeCalibration): PhaseMarks {
  return {
    B: calibration.marks.B ? { ...calibration.marks.B } : null,
    S: calibration.marks.S ? { ...calibration.marks.S } : null,
    G: calibration.marks.G ? { ...calibration.marks.G } : null,
  }
}

function clonePose(pose: PoseFrame | null): PhasePoseSnapshot | null {
  if (!pose) return null
  return {
    timestampMs: pose.timestampMs,
    videoWidth: pose.videoWidth,
    videoHeight: pose.videoHeight,
    nearSide: pose.nearSide ?? null,
    engine: pose.engine,
    landmarks: pose.landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility,
    })),
  }
}

function frameMetricsAt(frame: MetricsFrame, minVisibility: number): PhaseFrameMetrics {
  const joints = sagittalJoints(frame, minVisibility)
  if (!joints) {
    return { kneeFlexionDeg: null, trunkTorsoDeg: null, elbowDeg: null }
  }
  return {
    kneeFlexionDeg: sampleMetricDegrees(joints, 'kneeFlexion'),
    trunkTorsoDeg: sampleMetricDegrees(joints, 'trunkTorso'),
    elbowDeg: sampleMetricDegrees(joints, 'elbow'),
  }
}

function cycleBdcKnee(
  frames: readonly MetricsFrame[],
  cycle: MetricsCycle,
  minVisibility: number,
): number | null {
  const samples: BdcSample[] = []
  for (let i = cycle.startIndex; i <= cycle.endIndex; i += 1) {
    const frame = frames[i]!
    const angle = pedalAngleDeg(frame.pedal)
    if (angle === null) continue
    const joints = sagittalJoints(frame, minVisibility)
    if (!joints) continue
    const deg = sampleMetricDegrees(joints, 'kneeFlexion')
    if (deg === null || !Number.isFinite(deg)) continue
    samples.push({ angleDeg: angle, valueDeg: deg })
  }
  return estimateAtBdc(samples, { bdcAngleDeg: BDC_ANGLE_DEG, bdcWindowHalfDeg: BDC_WINDOW_HALF_DEG })?.valueDeg ?? null
}

/**
 * One valid cycle whose BDC knee is closest to the multi-cycle median.
 * Falls back to the middle valid cycle when BDC is unavailable.
 * Never invents a cycle from extrema.
 */
export function pickRepresentativeCycle(
  frames: readonly MetricsFrame[],
  cycles: readonly MetricsCycle[],
  minVisibility = DEFAULT_METRICS_OPTIONS.minVisibility,
): MetricsCycle | null {
  const valid = cycles.filter((cycle) => cycle.valid)
  if (valid.length === 0) return null
  const withBdc: Array<{ cycle: MetricsCycle; value: number }> = []
  for (const cycle of valid) {
    const value = cycleBdcKnee(frames, cycle, minVisibility)
    if (value !== null) withBdc.push({ cycle, value })
  }
  if (withBdc.length === 0) {
    return valid[Math.floor((valid.length - 1) / 2)] ?? null
  }
  const target = median(withBdc.map((row) => row.value))
  let best = withBdc[0]!
  let bestDist = Math.abs(best.value - target)
  for (let i = 1; i < withBdc.length; i += 1) {
    const row = withBdc[i]!
    const dist = Math.abs(row.value - target)
    if (dist < bestDist) {
      best = row
      bestDist = dist
    }
  }
  return best.cycle
}

export type PhaseFrameInput = MetricsFrame & {
  /** Optional still captured from this exact frame. */
  image?: PhaseImage | null
}

function closestInWindow(
  frames: readonly PhaseFrameInput[],
  startIndex: number,
  endIndex: number,
  targetDeg: number,
  windowHalfDeg: number,
): { index: number; angleDeg: number; dist: number } | null {
  let best: { index: number; angleDeg: number; dist: number } | null = null
  for (let i = startIndex; i <= endIndex; i += 1) {
    const angle = pedalAngleDeg(frames[i]!.pedal)
    if (angle === null) continue
    const dist = crankDistanceDeg(angle, targetDeg)
    if (dist > windowHalfDeg) continue
    if (!best || dist < best.dist) best = { index: i, angleDeg: angle, dist }
  }
  return best
}

export type BuildPhaseEvidenceInput = {
  frames: readonly PhaseFrameInput[]
  calibration: BikeCalibration
  side: CameraNearSide
  source: ResultSource
  metricMethod: MetricMethod
  capturedAt?: string
  windowHalfDeg?: number
  minVisibility?: number
  stored?: boolean
}

function emptySlot(id: PhaseId): PhaseSlot {
  return {
    id,
    targetDeg: PHASE_TARGET_DEG[id],
    status: 'missing',
    frame: null,
  }
}

function toFrameEvidence(
  frames: readonly PhaseFrameInput[],
  hit: { index: number; angleDeg: number },
  cycleIndex: number,
  calibration: BikeCalibration,
  side: CameraNearSide,
  capturedAt: string,
  minVisibility: number,
): PhaseFrameEvidence {
  const frame = frames[hit.index]!
  const phase01 =
    frame.pedal.phase01 !== null && Number.isFinite(frame.pedal.phase01)
      ? ((frame.pedal.phase01 % 1) + 1) % 1
      : hit.angleDeg / 360
  const image = frame.image ?? null
  return {
    frameIndex: hit.index,
    timestampMs: frame.timestampMs,
    capturedAt,
    crankAngleDeg: hit.angleDeg,
    phase01,
    cycleIndex,
    nearSide: frame.pose?.nearSide ?? side,
    marks: cloneMarks(calibration),
    pose: clonePose(frame.pose),
    frameMetrics: frameMetricsAt(frame, minVisibility),
    image: image ? { mime: 'image/jpeg', dataUrl: image.dataUrl } : null,
  }
}

/**
 * Pick phase stills from a valid representative cycle using measured crank angle.
 * A target with no in-window sample is `missing` — never a min-knee / max-toe stand-in.
 */
export function buildPhaseEvidence(input: BuildPhaseEvidenceInput): PhaseEvidence {
  const windowHalfDeg = input.windowHalfDeg ?? PHASE_WINDOW_HALF_DEG
  const minVisibility = input.minVisibility ?? DEFAULT_METRICS_OPTIONS.minVisibility
  const capturedAt = input.capturedAt ?? new Date().toISOString()
  const cycles = detectCycles(input.frames, DEFAULT_METRICS_OPTIONS)
  const representative = pickRepresentativeCycle(input.frames, cycles, minVisibility)
  const cycleMeta: PhaseRepresentativeCycle | null = representative
    ? {
        index: representative.index,
        startIndex: representative.startIndex,
        endIndex: representative.endIndex,
        startMs: representative.startMs,
        endMs: representative.endMs,
      }
    : null

  const slots: PhaseSlot[] = PHASE_IDS.map((id) => {
    if (!representative) return emptySlot(id)
    const hit = closestInWindow(
      input.frames,
      representative.startIndex,
      representative.endIndex,
      PHASE_TARGET_DEG[id],
      windowHalfDeg,
    )
    if (!hit) return emptySlot(id)
    return {
      id,
      targetDeg: PHASE_TARGET_DEG[id],
      status: 'captured',
      frame: toFrameEvidence(
        input.frames,
        hit,
        representative.index,
        input.calibration,
        input.side,
        capturedAt,
        minVisibility,
      ),
    }
  })

  return {
    schemaVersion: PHASE_EVIDENCE_SCHEMA_VERSION,
    stored: input.stored !== false,
    selectionMethod: PHASE_SELECTION_METHOD,
    metricMethod: input.metricMethod,
    windowHalfDeg,
    side: input.side,
    source: input.source,
    representativeCycle: cycleMeta,
    calibrationVersion: input.calibration.version,
    setupId: input.calibration.binding?.setupId ?? null,
    capturedAt,
    slots,
  }
}

/** Drop still pixels. Metadata stays so missing vs deleted stay distinct. */
export function stripPhaseImages(evidence: PhaseEvidence): PhaseEvidence {
  return {
    ...evidence,
    stored: false,
    slots: evidence.slots.map((slot) => {
      if (slot.status !== 'captured' || !slot.frame) return slot
      return {
        ...slot,
        status: 'deleted',
        frame: { ...slot.frame, image: null },
      }
    }),
  }
}

export function phaseWantsImage(
  angleDeg: number | null,
  windowHalfDeg = PHASE_WINDOW_HALF_DEG,
): boolean {
  if (angleDeg === null || !Number.isFinite(angleDeg)) return false
  return PHASE_IDS.some((id) => inPhaseWindow(angleDeg, PHASE_TARGET_DEG[id], windowHalfDeg))
}

export function nearestPhaseId(
  angleDeg: number,
  windowHalfDeg = PHASE_WINDOW_HALF_DEG,
): PhaseId | null {
  let best: { id: PhaseId; dist: number } | null = null
  for (const id of PHASE_IDS) {
    const dist = crankDistanceDeg(angleDeg, PHASE_TARGET_DEG[id])
    if (dist > windowHalfDeg) continue
    if (!best || dist < best.dist) best = { id, dist }
  }
  return best?.id ?? null
}
