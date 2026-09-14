/** Beginner change → recapture → compare loop (L3 / Briefing V2 §3E). Local only. */

import type { ActionKind, ActionLensStatus } from './action.ts'
import type { CaptureType } from './capture.ts'
import type { ObservationSide } from './observation.ts'

export const DOCUMENTED_CHANGE_KIND = 'bikefit.documented-change' as const
export const DOCUMENTED_CHANGE_SCHEMA_VERSION = 1 as const

export const CHANGE_COMPARISON_KIND = 'bikefit.change-comparison' as const
export const CHANGE_COMPARISON_SCHEMA_VERSION = 1 as const

export const CHANGE_LINK_KIND = 'bikefit.change-link' as const
export const CHANGE_LINK_SCHEMA_VERSION = 1 as const

/** Predeclared AP-09 engineering gate for unchanged-setup repeatability. Not clinical accuracy. */
export const REPEATABILITY_BAND_DEG = 3

export const CHANGE_PARAMETERS = ['seat_height'] as const
export type ChangeParameter = (typeof CHANGE_PARAMETERS)[number]

export const CHANGE_DIRECTIONS = ['higher', 'lower'] as const
export type ChangeDirection = (typeof CHANGE_DIRECTIONS)[number]

export const CHANGE_DOCUMENT_SOURCES = ['action_adjust', 'user_path'] as const
export type ChangeDocumentSource = (typeof CHANGE_DOCUMENT_SOURCES)[number]

export const CHANGE_VERDICTS = ['not_comparable', 'no_secure_change', 'measurable_delta'] as const
export type ChangeVerdict = (typeof CHANGE_VERDICTS)[number]

export const CHANGE_INCOMPATIBILITY_REASONS = [
  'method_mismatch',
  'method_version_mismatch',
  'metric_mismatch',
  'profile_mismatch',
  'side_mismatch',
  'camera_changed',
  'lens_changed',
  'geometry_changed',
  'missing_value',
] as const
export type ChangeIncompatibilityReason = (typeof CHANGE_INCOMPATIBILITY_REASONS)[number]

export type CaptureSetupFingerprint = {
  deviceId: string | null
  cameraKind: 'continuity' | 'mac_webcam' | 'other' | null
  captureType: CaptureType | null
  width: number | null
  height: number | null
  geometryRevision: number | null
  setupId: string | null
  lensStatus: ActionLensStatus
  userReportedLens: string | null
}

export type ObservationSnapshot = {
  resultId: string
  captureId: string
  analysisId: string
  metricId: 'knee_flexion'
  method: string | null
  methodVersion: string | null
  valueDeg: number | null
  cycles: number | null
  side: ObservationSide | null
  profileId: string | null
  profileReleased: boolean
  ruleId: string | null
  targetLowDeg: number | null
  targetHighDeg: number | null
  setup: CaptureSetupFingerprint
  actionKind: ActionKind
}

export type DocumentedChange = {
  schemaVersion: typeof DOCUMENTED_CHANGE_SCHEMA_VERSION
  kind: typeof DOCUMENTED_CHANGE_KIND
  id: string
  createdAt: string
  parameter: ChangeParameter
  direction: ChangeDirection
  noteOld: string | null
  noteNew: string | null
  source: ChangeDocumentSource
  previous: ObservationSnapshot
}

export type CompatibilityFlags = {
  method: boolean
  methodVersion: boolean
  metric: boolean
  profile: boolean
  setup: boolean
  side: boolean
  camera: boolean
  lens: boolean
  reasons: ChangeIncompatibilityReason[]
}

export type ChangeComparison = {
  schemaVersion: typeof CHANGE_COMPARISON_SCHEMA_VERSION
  kind: typeof CHANGE_COMPARISON_KIND
  id: string
  createdAt: string
  changeId: string
  previous: ObservationSnapshot
  next: ObservationSnapshot
  documentedChange: {
    id: string
    parameter: ChangeParameter
    direction: ChangeDirection
    noteOld: string | null
    noteNew: string | null
    source: ChangeDocumentSource
  }
  compatibility: CompatibilityFlags
  comparable: boolean
  metricId: 'knee_flexion'
  method: string | null
  methodVersion: string | null
  beforeDeg: number | null
  afterDeg: number | null
  deltaDeg: number | null
  repeatabilityBandDeg: number
  verdict: ChangeVerdict
  headline: string
  detail: string
  /** Set only when a matching released profile exists. Never a comfort/injury claim. */
  targetBandNote: string | null
}

/**
 * Frozen link on the *new* result: previous observation ↔ documented change ↔ new capture/analysis.
 * Previous results stay immutable.
 */
export type ChangeLink = {
  schemaVersion: typeof CHANGE_LINK_SCHEMA_VERSION
  kind: typeof CHANGE_LINK_KIND
  previousResultId: string
  previousCaptureId: string
  previousAnalysisId: string
  nextCaptureId: string
  nextAnalysisId: string
  documentedChange: DocumentedChange
  comparison: ChangeComparison
}
