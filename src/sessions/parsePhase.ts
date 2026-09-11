import {
  PHASE_EVIDENCE_SCHEMA_VERSION,
  PHASE_IDS,
  PHASE_SELECTION_METHOD,
  PHASE_SLOT_STATUSES,
  PHASE_TARGET_DEG,
  type PhaseEvidence,
  type PhaseFrameEvidence,
  type PhaseFrameMetrics,
  type PhaseId,
  type PhaseImage,
  type PhaseMarks,
  type PhasePoseSnapshot,
  type PhaseRepresentativeCycle,
  type PhaseSlot,
  type PhaseSlotStatus,
} from '../types/phase.ts'
import { METRIC_METHODS, type MetricMethod } from '../types/metrics.ts'
import { RESULT_SOURCES, type ResultSource } from '../types/result.ts'
import type { CameraNearSide, Landmark, PoseEngineId } from '../types/landmarks.ts'
import type { ParseResult } from './schema.ts'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && Number.isFinite(Date.parse(value))
}

function isSide(value: unknown): value is CameraNearSide {
  return value === 'left' || value === 'right'
}

function parsePoint(value: unknown): { x: number; y: number } | null | undefined {
  if (value === null) return null
  if (!isPlainObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return undefined
  return { x: value.x, y: value.y }
}

function parseMarks(value: unknown): ParseResult<PhaseMarks> {
  if (!isPlainObject(value)) return { ok: false, reason: 'phaseEvidence marks must be an object' }
  const B = parsePoint(value.B ?? null)
  const S = parsePoint(value.S ?? null)
  const G = parsePoint(value.G ?? null)
  if (B === undefined || S === undefined || G === undefined) {
    return { ok: false, reason: 'phaseEvidence marks B/S/G must be points or null' }
  }
  return { ok: true, value: { B, S, G } }
}

function parseLandmark(value: unknown): Landmark | null {
  if (!isPlainObject(value)) return null
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null
  if (!isFiniteNumber(value.visibility)) return null
  return { x: value.x, y: value.y, z: value.z, visibility: value.visibility }
}

function parsePose(value: unknown): ParseResult<PhasePoseSnapshot | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'phase frame pose must be an object or null' }
  if (!isFiniteNumber(value.timestampMs) || !isFiniteNumber(value.videoWidth) || !isFiniteNumber(value.videoHeight)) {
    return { ok: false, reason: 'phase frame pose is missing size/time' }
  }
  if (!(value.nearSide === null || isSide(value.nearSide))) {
    return { ok: false, reason: 'phase frame pose.nearSide must be left, right, or null' }
  }
  if (value.engine !== 'mediapipe' && value.engine !== 'synthetic') {
    return { ok: false, reason: 'phase frame pose.engine is unknown' }
  }
  if (!Array.isArray(value.landmarks)) return { ok: false, reason: 'phase frame pose.landmarks must be an array' }
  const landmarks: Landmark[] = []
  for (const entry of value.landmarks) {
    const lm = parseLandmark(entry)
    if (!lm) return { ok: false, reason: 'phase frame landmark is invalid' }
    landmarks.push(lm)
  }
  return {
    ok: true,
    value: {
      timestampMs: value.timestampMs,
      videoWidth: value.videoWidth,
      videoHeight: value.videoHeight,
      nearSide: value.nearSide,
      engine: value.engine as PoseEngineId,
      landmarks,
    },
  }
}

function parseFrameMetrics(value: unknown): ParseResult<PhaseFrameMetrics> {
  if (!isPlainObject(value)) return { ok: false, reason: 'phase frameMetrics must be an object' }
  if (!isNumberOrNull(value.kneeFlexionDeg) || !isNumberOrNull(value.trunkTorsoDeg) || !isNumberOrNull(value.elbowDeg)) {
    return { ok: false, reason: 'phase frameMetrics must be finite numbers or null' }
  }
  return {
    ok: true,
    value: {
      kneeFlexionDeg: value.kneeFlexionDeg,
      trunkTorsoDeg: value.trunkTorsoDeg,
      elbowDeg: value.elbowDeg,
    },
  }
}

function parseImage(value: unknown): ParseResult<PhaseImage | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'phase image must be an object or null' }
  if (value.mime !== 'image/jpeg') return { ok: false, reason: 'phase image.mime must be image/jpeg' }
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:image/')) {
    return { ok: false, reason: 'phase image.dataUrl must be a local data:image URL' }
  }
  return { ok: true, value: { mime: 'image/jpeg', dataUrl: value.dataUrl } }
}

function parseFrame(value: unknown): ParseResult<PhaseFrameEvidence> {
  if (!isPlainObject(value)) return { ok: false, reason: 'phase frame must be an object' }
  if (!isFiniteNumber(value.frameIndex) || value.frameIndex < 0) {
    return { ok: false, reason: 'phase frame.frameIndex must be a finite number ≥ 0' }
  }
  if (!isFiniteNumber(value.timestampMs)) return { ok: false, reason: 'phase frame.timestampMs must be finite' }
  if (!isTimestamp(value.capturedAt)) return { ok: false, reason: 'phase frame.capturedAt must be a timestamp' }
  if (!isFiniteNumber(value.crankAngleDeg)) return { ok: false, reason: 'phase frame.crankAngleDeg must be finite' }
  if (!isFiniteNumber(value.phase01)) return { ok: false, reason: 'phase frame.phase01 must be finite' }
  if (!isFiniteNumber(value.cycleIndex) || value.cycleIndex < 0) {
    return { ok: false, reason: 'phase frame.cycleIndex must be a finite number ≥ 0' }
  }
  if (!isSide(value.nearSide)) return { ok: false, reason: 'phase frame.nearSide must be left or right' }
  const marks = parseMarks(value.marks)
  if (!marks.ok) return marks
  const pose = parsePose(value.pose)
  if (!pose.ok) return pose
  const frameMetrics = parseFrameMetrics(value.frameMetrics)
  if (!frameMetrics.ok) return frameMetrics
  const image = parseImage(value.image)
  if (!image.ok) return image
  return {
    ok: true,
    value: {
      frameIndex: value.frameIndex,
      timestampMs: value.timestampMs,
      capturedAt: value.capturedAt,
      crankAngleDeg: value.crankAngleDeg,
      phase01: value.phase01,
      cycleIndex: value.cycleIndex,
      nearSide: value.nearSide,
      marks: marks.value,
      pose: pose.value,
      frameMetrics: frameMetrics.value,
      image: image.value,
    },
  }
}

function parseSlot(value: unknown, index: number): ParseResult<PhaseSlot> {
  if (!isPlainObject(value)) return { ok: false, reason: `phaseEvidence.slots[${index}] must be an object` }
  if (typeof value.id !== 'string' || !PHASE_IDS.includes(value.id as PhaseId)) {
    return { ok: false, reason: `phaseEvidence.slots[${index}].id is not a known phase` }
  }
  const id = value.id as PhaseId
  if (!isFiniteNumber(value.targetDeg) || value.targetDeg !== PHASE_TARGET_DEG[id]) {
    return { ok: false, reason: `phaseEvidence.slots[${index}].targetDeg must match crank convention` }
  }
  if (typeof value.status !== 'string' || !PHASE_SLOT_STATUSES.includes(value.status as PhaseSlotStatus)) {
    return { ok: false, reason: `phaseEvidence.slots[${index}].status is unknown` }
  }
  if (value.frame === null || value.frame === undefined) {
    if (value.status === 'captured') {
      return { ok: false, reason: `phaseEvidence.slots[${index}] captured slot needs a frame` }
    }
    return { ok: true, value: { id, targetDeg: value.targetDeg, status: value.status as PhaseSlotStatus, frame: null } }
  }
  const frame = parseFrame(value.frame)
  if (!frame.ok) return frame
  return {
    ok: true,
    value: { id, targetDeg: value.targetDeg, status: value.status as PhaseSlotStatus, frame: frame.value },
  }
}

function parseCycle(value: unknown): ParseResult<PhaseRepresentativeCycle | null> {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'phaseEvidence.representativeCycle must be an object or null' }
  if (
    !isFiniteNumber(value.index) ||
    !isFiniteNumber(value.startIndex) ||
    !isFiniteNumber(value.endIndex) ||
    !isFiniteNumber(value.startMs) ||
    !isFiniteNumber(value.endMs)
  ) {
    return { ok: false, reason: 'phaseEvidence.representativeCycle is missing indices' }
  }
  return {
    ok: true,
    value: {
      index: value.index,
      startIndex: value.startIndex,
      endIndex: value.endIndex,
      startMs: value.startMs,
      endMs: value.endMs,
    },
  }
}

/** Optional on v1 results. Present payload must be well-formed. */
export function parsePhaseEvidence(value: unknown): ParseResult<PhaseEvidence | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.phaseEvidence must be an object or null' }
  if (value.schemaVersion !== PHASE_EVIDENCE_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported phaseEvidence.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (typeof value.stored !== 'boolean') return { ok: false, reason: 'phaseEvidence.stored must be a boolean' }
  if (value.selectionMethod !== PHASE_SELECTION_METHOD) {
    return { ok: false, reason: 'phaseEvidence.selectionMethod must be crank_angle' }
  }
  if (typeof value.metricMethod !== 'string' || !METRIC_METHODS.includes(value.metricMethod as MetricMethod)) {
    return { ok: false, reason: 'phaseEvidence.metricMethod is not a known metric method' }
  }
  if (!isFiniteNumber(value.windowHalfDeg) || value.windowHalfDeg <= 0) {
    return { ok: false, reason: 'phaseEvidence.windowHalfDeg must be a positive finite number' }
  }
  if (!isSide(value.side)) return { ok: false, reason: 'phaseEvidence.side must be left or right' }
  if (typeof value.source !== 'string' || !RESULT_SOURCES.includes(value.source as ResultSource)) {
    return { ok: false, reason: 'phaseEvidence.source must be camera, synthetic, or demo' }
  }
  if (!isFiniteNumber(value.calibrationVersion)) {
    return { ok: false, reason: 'phaseEvidence.calibrationVersion must be finite' }
  }
  if (!(value.setupId === null || typeof value.setupId === 'string')) {
    return { ok: false, reason: 'phaseEvidence.setupId must be a string or null' }
  }
  if (!isTimestamp(value.capturedAt)) return { ok: false, reason: 'phaseEvidence.capturedAt must be a timestamp' }
  const cycle = parseCycle(value.representativeCycle)
  if (!cycle.ok) return cycle
  if (!Array.isArray(value.slots) || value.slots.length !== PHASE_IDS.length) {
    return { ok: false, reason: 'phaseEvidence.slots must list tdc, forward, bdc, back' }
  }
  const slots: PhaseSlot[] = []
  for (const [index, entry] of value.slots.entries()) {
    const parsed = parseSlot(entry, index)
    if (!parsed.ok) return parsed
    if (parsed.value.id !== PHASE_IDS[index]) {
      return { ok: false, reason: 'phaseEvidence.slots must be in crank order' }
    }
    slots.push(parsed.value)
  }
  return {
    ok: true,
    value: {
      schemaVersion: PHASE_EVIDENCE_SCHEMA_VERSION,
      stored: value.stored,
      selectionMethod: PHASE_SELECTION_METHOD,
      metricMethod: value.metricMethod as MetricMethod,
      windowHalfDeg: value.windowHalfDeg,
      side: value.side,
      source: value.source as ResultSource,
      representativeCycle: cycle.value,
      calibrationVersion: value.calibrationVersion,
      setupId: value.setupId,
      capturedAt: value.capturedAt,
      slots,
    },
  }
}
