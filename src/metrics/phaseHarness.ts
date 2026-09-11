import { computePixelBikeTransform } from '../calibration/transform.ts'
import { SYNTHETIC_MARKS, syntheticCrankAngleDeg, syntheticPedalPixel } from '../camera/synthetic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { POSE_LANDMARK } from '../types/landmarks.ts'
import { CALIBRATION_SCHEMA_VERSION, type BikeCalibration } from '../types/calibration.ts'
import type { MetricsFrame } from '../types/metrics.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { PHASE_SELECTION_METHOD, PHASE_TARGET_DEG, PHASE_WINDOW_HALF_DEG } from '../types/phase.ts'
import { parseMeasurementResult } from '../sessions/parseResult.ts'
import { comparePhaseResults } from '../sessions/compare.ts'
import { LAB_PROFILE } from '../flow/profile.ts'
import { buildMeasurementResult } from '../flow/buildResult.ts'
import { cloneJson } from '../flow/buildResult.ts'
import { pedalAngleDeg } from './cycles.ts'
import { createPhaseCapture } from './phaseCapture.ts'
import {
  buildPhaseEvidence,
  crankDistanceDeg,
  inPhaseWindow,
  stripPhaseImages,
} from './phaseFrames.ts'

export type PhaseHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type PhaseHarnessResult = {
  passed: boolean
  cases: PhaseHarnessCase[]
  message: string
}

const FPS = 30
const DT_MS = 1000 / FPS
const RPM = 80
const MS_PER_REV = (60 / RPM) * 1000

const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

if (!TRANSFORM) throw new Error('Synthetic B/S/G must produce a transform.')

function calibrationOf(): BikeCalibration {
  const now = '2026-09-11T10:00:00.000Z'
  return {
    version: CALIBRATION_SCHEMA_VERSION,
    marks: { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } },
    transform: TRANSFORM,
    createdAt: now,
    updatedAt: now,
    binding: {
      source: 'synthetic',
      deviceId: null,
      width: 1280,
      height: 720,
      setupId: 'synthetic:default:1280x720',
    },
  }
}

function lockedPedal(timestampMs: number): PedalSample {
  const angle = syntheticCrankAngleDeg(timestampMs)
  return {
    timestampMs,
    pixel: syntheticPedalPixel(timestampMs),
    crankAngleDeg: angle,
    phase01: angle / 360,
    revolutions: Math.floor(timestampMs / MS_PER_REV),
    status: 'locked',
    lostFrames: 0,
  }
}

function jpegFor(index: number) {
  const payload = `phase-frame-${index}`
  let encoded = ''
  for (let i = 0; i < payload.length; i += 1) encoded += payload.charCodeAt(i).toString(16).padStart(2, '0')
  return { mime: 'image/jpeg' as const, dataUrl: `data:image/jpeg;base64,${encoded}` }
}

function collectFrames(
  revs: number,
  poseAt: (t: number) => PoseFrame | null,
  keep: (angle: number) => boolean = () => true,
  startMs = 0,
): MetricsFrame[] {
  const durationMs = revs * MS_PER_REV + DT_MS
  const frames: MetricsFrame[] = []
  for (let t = 0; t <= durationMs; t += DT_MS) {
    const timestampMs = startMs + t
    const pedal = lockedPedal(timestampMs)
    const angle = pedal.crankAngleDeg
    if (angle !== null && !keep(angle)) continue
    frames.push({
      timestampMs,
      pose: poseAt(timestampMs),
      pedal,
      transform: TRANSFORM,
      image: jpegFor(frames.length),
    } as MetricsFrame & { image: ReturnType<typeof jpegFor> })
  }
  return frames
}

/** Flexed at 40° crank (fake NintAi "extrema"), extended at 180°. */
function extremaPose(timestampMs: number): PoseFrame {
  const pose = syntheticPoseFrame(timestampMs)
  const angle = syntheticCrankAngleDeg(timestampMs)
  const hip = pose.landmarks[POSE_LANDMARK.RIGHT_HIP]!
  const ankle = pose.landmarks[POSE_LANDMARK.RIGHT_ANKLE]!
  const nearFakeBdc = crankDistanceDeg(angle, 40) <= 8 ? 1 : 0
  const midX = (hip.x + ankle.x) / 2
  const midY = (hip.y + ankle.y) / 2
  const dx = ankle.x - hip.x
  const dy = ankle.y - hip.y
  const plen = Math.hypot(-dy, dx) || 1
  const offset = 0.09 * nearFakeBdc
  return {
    ...pose,
    nearSide: 'right',
    landmarks: pose.landmarks.map((lm, i) =>
      i === POSE_LANDMARK.RIGHT_KNEE
        ? { ...lm, x: midX + (-dy / plen) * offset, y: midY + (dx / plen) * offset, visibility: 0.96 }
        : lm,
    ),
  }
}

function check(name: string, passed: boolean, detail: string): PhaseHarnessCase {
  return { name, passed, detail }
}

export function runPhaseHarness(): PhaseHarnessResult {
  const cases: PhaseHarnessCase[] = []
  const calib = calibrationOf()
  const frames = collectFrames(6, syntheticPoseFrame)
  const evidence = buildPhaseEvidence({
    frames: frames as never,
    calibration: calib,
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
    capturedAt: '2026-09-11T10:05:00.000Z',
  })

  const captured = evidence.slots.filter((slot) => slot.status === 'captured')
  const allTrace = evidence.slots.every((slot) => {
    if (slot.status !== 'captured' || !slot.frame) return slot.status === 'missing'
    const src = frames[slot.frame.frameIndex]
    if (!src) return false
    const angle = pedalAngleDeg(src.pedal)
    return (
      src.timestampMs === slot.frame.timestampMs &&
      angle !== null &&
      inPhaseWindow(angle, slot.targetDeg) &&
      slot.frame.image?.dataUrl === (src as { image?: { dataUrl: string } }).image?.dataUrl
    )
  })
  cases.push(
    check(
      'each captured phase traces to a real in-window frame',
      captured.length === 4 && allTrace && evidence.selectionMethod === PHASE_SELECTION_METHOD,
      `captured=${captured.length} method=${evidence.selectionMethod}`,
    ),
  )

  const gapFrames = collectFrames(6, syntheticPoseFrame, (angle) => !inPhaseWindow(angle, 90, PHASE_WINDOW_HALF_DEG))
  const gapped = buildPhaseEvidence({
    frames: gapFrames as never,
    calibration: calib,
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
  })
  const forward = gapped.slots.find((slot) => slot.id === 'forward')
  const othersOk = gapped.slots.filter((slot) => slot.id !== 'forward').every((slot) => slot.status === 'captured')
  cases.push(
    check(
      'missing 90° stays missing — not a random extremum',
      forward?.status === 'missing' && forward.frame === null && othersOk,
      `forward=${forward?.status} others=${gapped.slots.map((s) => `${s.id}:${s.status}`).join(',')}`,
    ),
  )

  const extremaFrames = collectFrames(6, extremaPose)
  const extremaEvidence = buildPhaseEvidence({
    frames: extremaFrames as never,
    calibration: calib,
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
  })
  const bdc = extremaEvidence.slots.find((slot) => slot.id === 'bdc')
  const bdcAngle = bdc?.frame?.crankAngleDeg ?? -1
  cases.push(
    check(
      'BDC uses crank 180° not knee-extremum at 40°',
      bdc?.status === 'captured' && inPhaseWindow(bdcAngle, PHASE_TARGET_DEG.bdc),
      `bdcAngle=${bdcAngle.toFixed(1)}`,
    ),
  )

  const noBdc = collectFrames(6, extremaPose, (angle) => !inPhaseWindow(angle, 180, PHASE_WINDOW_HALF_DEG))
  const missingBdc = buildPhaseEvidence({
    frames: noBdc as never,
    calibration: calib,
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
  })
  cases.push(
    check(
      'empty BDC window is missing even when a 40° knee extremum exists',
      missingBdc.slots.find((slot) => slot.id === 'bdc')?.status === 'missing',
      missingBdc.slots.map((s) => `${s.id}:${s.status}`).join(','),
    ),
  )

  const liveCal = cloneJson(calib)
  liveCal.marks.B = { x: 1, y: 1 }
  liveCal.version = 99
  const storedB = evidence.slots[0]?.frame?.marks.B?.x
  cases.push(
    check(
      'later calib change does not mutate stored phase marks',
      storedB === SYNTHETIC_MARKS.B.x && liveCal.marks.B.x === 1 && evidence.calibrationVersion === 1,
      `storedB=${storedB} liveB=${liveCal.marks.B.x}`,
    ),
  )

  const stripped = stripPhaseImages(evidence)
  cases.push(
    check(
      'delete stills keeps missing vs deleted distinct',
      stripped.stored === false &&
        stripped.slots.every((slot) =>
          slot.status === 'captured' || slot.status === 'deleted'
            ? slot.status === 'deleted' && slot.frame?.image === null && slot.frame?.frameIndex != null
            : slot.status === 'missing',
        ) &&
        evidence.stored === true &&
        evidence.slots.some((slot) => slot.frame?.image),
      `stripped=${stripped.slots.map((s) => s.status).join(',')}`,
    ),
  )

  const result = buildMeasurementResult({
    id: 'phase-res',
    startedAt: '2026-09-11T10:00:00.000Z',
    endedAt: '2026-09-11T10:05:00.000Z',
    capture: 'synthetic',
    evaluation: 'standard',
    profile: LAB_PROFILE,
    calibration: calib,
    metrics: [
      {
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 38,
        unit: '°',
        method: 'bottom_dead_center',
        usableCycles: 6,
        band: 'unknown',
        targetHint: 'am tiefsten Pedalpunkt',
      },
    ],
    quality: {
      level: 'ok',
      label: 'Qualität ausreichend',
      validRevs: 6,
      targetRevs: 10,
      lostFrames: 0,
      notes: [],
    },
    recommendations: [],
    validRevs: 6,
    targetRevs: 10,
    adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
    phaseEvidence: evidence,
  })
  const parsed = parseMeasurementResult(JSON.parse(JSON.stringify(result)))
  cases.push(
    check(
      'parse round-trip keeps phase stills on the immutable result',
      parsed.ok &&
        parsed.value.phaseEvidence?.slots[2]?.frame?.image?.dataUrl === evidence.slots[2]?.frame?.image?.dataUrl &&
        parsed.value.phaseEvidence?.selectionMethod === 'crank_angle',
      parsed.ok ? 'ok' : parsed.reason,
    ),
  )

  const after = cloneJson(result)
  if (after.phaseEvidence) after.phaseEvidence.side = 'left'
  const sideBlock = comparePhaseResults(result, after)
  const same = comparePhaseResults(result, cloneJson(result), { before: 'Canyon', after: 'Canyon SL' })
  cases.push(
    check(
      'before/after requires source/side/method/calib; bike change is a note',
      !sideBlock.compatible &&
        sideBlock.reasons.includes('side') &&
        same.compatible &&
        same.bikeChanged &&
        Boolean(same.bikeNote),
      `side=${sideBlock.reasons.join(',')} bikeNote=${same.bikeNote ?? 'none'}`,
    ),
  )

  const cap = createPhaseCapture()
  for (const frame of frames as never as Array<MetricsFrame & { image?: ReturnType<typeof jpegFor> }>) {
    if (cap.shouldEncode(pedalAngleDeg(frame.pedal))) {
      cap.push(frame, frame.image ?? null)
    } else {
      cap.push(frame, null)
    }
  }
  const frozen = cap.freeze({
    calibration: calib,
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
  })
  const again = cap.freeze({
    calibration: { ...calib, version: 77, marks: { B: { x: 9, y: 9 }, S: null, G: null } },
    side: 'left',
    source: 'camera',
    metricMethod: 'cycle_mean',
  })
  cases.push(
    check(
      'freeze is idempotent — live calib after freeze is ignored',
      again === frozen &&
        frozen.calibrationVersion === 1 &&
        frozen.side === 'right' &&
        frozen.slots.some((slot) => slot.frame?.image),
      `v=${frozen.calibrationVersion} side=${frozen.side}`,
    ),
  )

  const passed = cases.every((item) => item.passed)
  return {
    passed,
    cases,
    message: passed ? `PHASE_OK ${cases.length} checks` : `PHASE_FAIL ${cases.filter((c) => !c.passed).length}/${cases.length}`,
  }
}
