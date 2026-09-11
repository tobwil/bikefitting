import type { PixelPoint } from './calibration.ts'

export const FOOT_DIAGNOSTIC_SCHEMA_VERSION = 1

export const FOOT_STATUSES = [
  'visible',
  'occluded',
  'insufficient',
  'no_scale_length_blocked',
] as const
export type FootDiagnosticStatus = (typeof FOOT_STATUSES)[number]

export type FootLandmarkSample = {
  pixel: PixelPoint | null
  visibility: number
  occluded: boolean
}

export type FootFrameSample = {
  timestampMs: number
  crankAngleDeg: number | null
  heel: FootLandmarkSample
  toe: FootLandmarkSample
  /** Heel or toe occlusion locks this foot metric for the frame. */
  metricLocked: boolean
}

/**
 * Extra diagnosis over the cycle. Not a metric card and not a recommendation.
 * New cards / recs only after validation — this stage ships none.
 */
export type FootCycleDiagnostic = {
  schemaVersion: typeof FOOT_DIAGNOSTIC_SCHEMA_VERSION
  status: FootDiagnosticStatus
  reason: string
  samples: number
  usableSamples: number
  occludedSamples: number
  heelOccluded: boolean
  toeOccluded: boolean
  metricLocked: boolean
  lengthClaimsAllowed: boolean
  overlay: {
    heelVisible: boolean
    toeVisible: boolean
  }
  metricCards: []
  recommendations: []
}
