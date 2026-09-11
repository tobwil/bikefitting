import {
  HAND_POSITIONS,
  METRIC_KEYS,
  SESSION_SCHEMA_VERSION,
  type HandPosition,
  type MeasurementSession,
  type SessionConditions,
  type SessionFrameSync,
  type SessionMetrics,
  type SessionPedalStatus,
  type SessionPoseEngine,
  type SessionQuality,
} from '../types/session.ts'
import type { CameraNearSide } from '../types/landmarks.ts'

export type ParseOk<T> = { ok: true; value: T }
export type ParseErr = { ok: false; reason: string }
export type ParseResult<T> = ParseOk<T> | ParseErr

const FRAME_SYNC: ReadonlySet<string> = new Set(['rvfc', 'raf', 'idle', 'none'])
const POSE_ENGINE: ReadonlySet<string> = new Set(['mediapipe', 'synthetic', 'none'])
const PEDAL_STATUS: ReadonlySet<string> = new Set([
  'idle',
  'seeding',
  'locked',
  'lost',
  'none',
])
const HAND: ReadonlySet<string> = new Set(HAND_POSITIONS)

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

export function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && Number.isFinite(Date.parse(value))
}

export function isHandPosition(value: unknown): value is HandPosition {
  return typeof value === 'string' && HAND.has(value)
}

export function isSide(value: unknown): value is CameraNearSide {
  return value === 'left' || value === 'right'
}

export function coerceSide(value: string): CameraNearSide {
  return value === 'left' ? 'left' : 'right'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseConditions(value: unknown): ParseResult<SessionConditions> {
  if (!isPlainObject(value)) return { ok: false, reason: 'conditions must be an object' }
  if (typeof value.bike !== 'string') return { ok: false, reason: 'conditions.bike must be a string' }
  if (!isSide(value.side)) return { ok: false, reason: 'conditions.side must be left or right' }
  if (!isHandPosition(value.handPosition)) {
    return { ok: false, reason: 'conditions.handPosition is not a known position' }
  }
  if (!isFiniteNumber(value.calibrationVersion)) {
    return { ok: false, reason: 'conditions.calibrationVersion must be a finite number' }
  }
  return {
    ok: true,
    value: {
      bike: value.bike,
      side: value.side,
      handPosition: value.handPosition,
      calibrationVersion: value.calibrationVersion,
    },
  }
}

function parseMetrics(value: unknown): ParseResult<SessionMetrics> {
  if (!isPlainObject(value)) return { ok: false, reason: 'metrics must be an object' }
  for (const key of METRIC_KEYS) {
    if (!(key in value)) return { ok: false, reason: `metrics.${key} is missing` }
  }
  if (!isNumberOrNull(value.kneeFlexionDeg)) {
    return { ok: false, reason: 'metrics.kneeFlexionDeg must be a finite number or null' }
  }
  if (!isNumberOrNull(value.crankAngleDeg)) {
    return { ok: false, reason: 'metrics.crankAngleDeg must be a finite number or null' }
  }
  if (!isNumberOrNull(value.pedalPhase01)) {
    return { ok: false, reason: 'metrics.pedalPhase01 must be a finite number or null' }
  }
  if (!isFiniteNumber(value.pedalRevolutions) || value.pedalRevolutions < 0) {
    return { ok: false, reason: 'metrics.pedalRevolutions must be a finite number ≥ 0' }
  }
  if (!isNumberOrNull(value.inferenceMs)) {
    return { ok: false, reason: 'metrics.inferenceMs must be a finite number or null' }
  }
  return {
    ok: true,
    value: {
      kneeFlexionDeg: value.kneeFlexionDeg,
      crankAngleDeg: value.crankAngleDeg,
      pedalPhase01: value.pedalPhase01,
      pedalRevolutions: value.pedalRevolutions,
      inferenceMs: value.inferenceMs,
    },
  }
}

function parseQuality(value: unknown): ParseResult<SessionQuality> {
  if (!isPlainObject(value)) return { ok: false, reason: 'quality must be an object' }
  if (!isNumberOrNull(value.landmarkVisibility)) {
    return { ok: false, reason: 'quality.landmarkVisibility must be a finite number or null' }
  }
  if (typeof value.poseEngine !== 'string' || !POSE_ENGINE.has(value.poseEngine)) {
    return { ok: false, reason: 'quality.poseEngine is not a known engine' }
  }
  if (typeof value.frameSync !== 'string' || !FRAME_SYNC.has(value.frameSync)) {
    return { ok: false, reason: 'quality.frameSync is not a known frame-sync mode' }
  }
  if (typeof value.pedalStatus !== 'string' || !PEDAL_STATUS.has(value.pedalStatus)) {
    return { ok: false, reason: 'quality.pedalStatus is not a known pedal status' }
  }
  if (typeof value.calibrationReady !== 'boolean') {
    return { ok: false, reason: 'quality.calibrationReady must be a boolean' }
  }
  return {
    ok: true,
    value: {
      landmarkVisibility: value.landmarkVisibility,
      poseEngine: value.poseEngine as SessionPoseEngine,
      frameSync: value.frameSync as SessionFrameSync,
      pedalStatus: value.pedalStatus as SessionPedalStatus,
      calibrationReady: value.calibrationReady,
    },
  }
}

/** Validate and strip unknown keys. Rejects corrupt / wrong-version records. */
export function parseSession(value: unknown): ParseResult<MeasurementSession> {
  if (!isPlainObject(value)) return { ok: false, reason: 'session must be an object' }
  if (value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported schemaVersion ${String(value.schemaVersion)} (want ${SESSION_SCHEMA_VERSION})`,
    }
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: 'id must be a non-empty string' }
  }
  if (!isTimestamp(value.createdAt)) return { ok: false, reason: 'createdAt must be a parseable timestamp' }
  if (!isTimestamp(value.updatedAt)) return { ok: false, reason: 'updatedAt must be a parseable timestamp' }
  if (!isTimestamp(value.capturedAt)) return { ok: false, reason: 'capturedAt must be a parseable timestamp' }
  if (typeof value.label !== 'string') return { ok: false, reason: 'label must be a string' }

  const conditions = parseConditions(value.conditions)
  if (!conditions.ok) return conditions
  const metrics = parseMetrics(value.metrics)
  if (!metrics.ok) return metrics
  const quality = parseQuality(value.quality)
  if (!quality.ok) return quality

  return {
    ok: true,
    value: {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: value.id,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      capturedAt: value.capturedAt,
      label: value.label,
      conditions: conditions.value,
      metrics: metrics.value,
      quality: quality.value,
    },
  }
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ses_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
