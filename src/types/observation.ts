/** Beginner observation report (Ergebnisvertrag B / AP-06). Not a v1 MeasurementResult cast. */

export const OBSERVATION_KIND = 'bikefit.observation' as const
export const OBSERVATION_SCHEMA_VERSION = 2 as const

export const OBSERVATION_STATUSES = ['usable', 'partial', 'retake', 'failed', 'incomplete'] as const
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number]

export const OBSERVATION_PHASE_SOURCES = ['marker', 'motion_estimate', 'unavailable'] as const
export type ObservationPhaseSource = (typeof OBSERVATION_PHASE_SOURCES)[number]

export const OBSERVATION_SIDES = ['left', 'right'] as const
export type ObservationSide = (typeof OBSERVATION_SIDES)[number]

export const OBSERVATION_REASON_CODES = [
  'analysis_stub',
  'method_not_available',
  'analysis_failed',
  'analysis_incomplete',
  'capture_incomplete',
  'missing_knee',
  'insufficient_cycles',
  'decoder_failed',
  'segment_unusable',
] as const
export type ObservationReasonCode = (typeof OBSERVATION_REASON_CODES)[number]

export type ObservationEvidenceRef = {
  id: string
  frameId?: string
  mediaTimeMs?: number
  caption?: string
}

export type ObservationMetric = {
  id: string
  method: string | null
  methodVersion: string | null
  value: number | null
  unit: string
  usableCycles: number
  spread: number | null
  available: boolean
  reasons: string[]
  evidenceIds: string[]
}

/**
 * Versioned observation report. Stub payloads (AP-05 not merged) set `stub: true`
 * and must not carry invented usable knee values.
 */
export type ObservationReport = {
  kind: typeof OBSERVATION_KIND
  schemaVersion: typeof OBSERVATION_SCHEMA_VERSION
  captureId: string
  analysisId: string
  jobId: string
  inputHash: string | null
  pipelineVersion: string
  status: ObservationStatus
  reasons: string[]
  reasonText: string
  method: string | null
  methodVersion: string | null
  phaseSource: ObservationPhaseSource
  side: ObservationSide | null
  mediaStartMs: number | null
  mediaEndMs: number | null
  geometryRevision: number | null
  metrics: ObservationMetric[]
  evidence: ObservationEvidenceRef[]
  stub: boolean
  completedAt: string
}

/** Frozen identity for save/export. Always includes ActionDecision + evidence refs. */
export type ResultIdentitySnapshot = {
  captureId: string
  analysisId: string
  method: string | null
  methodVersion: string | null
  actionDecision: import('./action.ts').ActionDecision
  evidenceRefs: string[]
}
