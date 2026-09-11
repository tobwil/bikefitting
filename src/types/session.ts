import type { CameraNearSide, PoseEngineId } from './landmarks.ts'
import type { PedalTrackStatus } from './pedal.ts'

/** Structured measurement session schema. Bump when the on-disk shape changes. */
export const SESSION_SCHEMA_VERSION = 1

/** localStorage fallback key (JSON envelope of sessions). */
export const SESSION_STORAGE_KEY = 'bikefit.sessions.v1'

export const SESSION_DB_NAME = 'bikefit-sessions'
export const SESSION_DB_VERSION = 1
export const SESSION_DB_STORE = 'sessions'

export const SESSION_EXPORT_KIND = 'bikefit.sessions.export'

export const HAND_POSITIONS = ['hoods', 'drops', 'tops', 'aero', 'other'] as const
export type HandPosition = (typeof HAND_POSITIONS)[number]

export type SessionBackendKind = 'indexeddb' | 'localStorage' | 'memory'

export type SessionPoseEngine = PoseEngineId | 'none'
export type SessionFrameSync = 'rvfc' | 'raf' | 'idle' | 'none'
export type SessionPedalStatus = PedalTrackStatus | 'none'

/**
 * Conditions that must match for a like-for-like before/after comparison.
 * Different bike, camera-near side, hand position, or calibration schema
 * version → comparison is marked restricted (deltas still computed, not Ampel).
 */
export type SessionConditions = {
  bike: string
  side: CameraNearSide
  handPosition: HandPosition
  calibrationVersion: number
}

export type ComparisonRestrictionReason = keyof SessionConditions

/** Numeric measurements only. No traffic-light / Ampel fields. */
export type SessionMetrics = {
  kneeFlexionDeg: number | null
  crankAngleDeg: number | null
  pedalPhase01: number | null
  pedalRevolutions: number
  inferenceMs: number | null
}

export type SessionQuality = {
  landmarkVisibility: number | null
  poseEngine: SessionPoseEngine
  frameSync: SessionFrameSync
  pedalStatus: SessionPedalStatus
  calibrationReady: boolean
}

export type MeasurementSession = {
  schemaVersion: number
  id: string
  createdAt: string
  updatedAt: string
  capturedAt: string
  label: string
  conditions: SessionConditions
  metrics: SessionMetrics
  quality: SessionQuality
}

export type SessionDeltas = {
  [K in keyof SessionMetrics]: number | null
}

export type SessionComparison = {
  beforeId: string
  afterId: string
  comparable: boolean
  restricted: boolean
  restrictedReasons: ComparisonRestrictionReason[]
  deltas: SessionDeltas
}

export type SessionExportEnvelope = {
  kind: typeof SESSION_EXPORT_KIND
  schemaVersion: number
  exportedAt: string
  sessions: MeasurementSession[]
}

export const METRIC_KEYS = [
  'kneeFlexionDeg',
  'crankAngleDeg',
  'pedalPhase01',
  'pedalRevolutions',
  'inferenceMs',
] as const satisfies ReadonlyArray<keyof SessionMetrics>
