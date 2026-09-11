/** Versioned bike-fit rule profiles (E6). Numbers live in JSON, not in UI. */

export const RULE_PROFILE_SCHEMA_VERSION = 1

export const RULE_PROFILE_STATUSES = [
  'test_only',
  'provisional',
  'nutzerziel',
  'approved',
  'retired',
] as const
export type RuleProfileStatus = (typeof RULE_PROFILE_STATUSES)[number]

export const RULE_METRICS = ['knee_flexion'] as const
export type RuleMetric = (typeof RULE_METRICS)[number]

export const RULE_METHODS = ['bottom_dead_center'] as const
export type RuleMethod = (typeof RULE_METHODS)[number]

export const RULE_DECISION_STATES = [
  'within_target',
  'borderline',
  'outside_target',
  'unavailable',
] as const
export type RuleDecisionState = (typeof RULE_DECISION_STATES)[number]

export const RULE_UNAVAILABLE_REASONS = [
  'profile_missing',
  'profile_invalid',
  'measurement_invalid',
  'insufficient_cycles',
  'metric_mismatch',
  'uncertainty_missing',
] as const
export type RuleUnavailableReason = (typeof RULE_UNAVAILABLE_REASONS)[number]

export type RuleSource = {
  id: string
  citation: string
  year: number | null
  url: string | null
  note: string | null
}

export type RuleOwner = {
  name: string
  role: string
}

/** Plan §10.4 recommendation block. Never include exact saddle millimetres. */
export type RuleRecommendation = {
  observation: string
  possibleCause: string
  prerequisite: string
  nextStep: string
  remeasure: string
}

export type RuleProfileCopy = {
  metricLabel: string
  within: RuleRecommendation
  borderlineHigh: RuleRecommendation
  borderlineLow: RuleRecommendation
  outsideHigh: RuleRecommendation
  outsideLow: RuleRecommendation
  unavailable: RuleRecommendation
}

/**
 * A versioned scoring profile. `productionEnabled` may be true only when
 * `status === 'approved'` after fachliche Freigabe. P0 ships false.
 */
export type RuleProfile = {
  schemaVersion: typeof RULE_PROFILE_SCHEMA_VERSION
  id: string
  status: RuleProfileStatus
  productionEnabled: boolean
  metric: RuleMetric
  method: RuleMethod
  targetDeg: number
  outsideMarginDeg: number
  minCycles: number
  assumedUncertaintyDeg: number
  owner: RuleOwner
  reviewedAt: string | null
  reviewer: string | null
  sources: RuleSource[]
  notes: string
  copy: RuleProfileCopy
}

export type RuleMeasurement = {
  metric: RuleMetric
  method: RuleMethod
  valueDeg: number | null
  /** When null, the profile's `assumedUncertaintyDeg` is used. */
  uncertaintyDeg: number | null
  cycles: number
  valid: boolean
}

export type RuleDecision = {
  state: RuleDecisionState
  profileId: string | null
  unavailableReason: RuleUnavailableReason | null
  valueDeg: number | null
  uncertaintyDeg: number | null
  targetDeg: number | null
  outsideMarginDeg: number | null
  lowBoundDeg: number | null
  highBoundDeg: number | null
  /** Sign of (value − target): high = more flexed for knee_flexion. */
  side: 'high' | 'low' | 'on' | null
  cycles: number | null
  minCycles: number | null
}

export type AmpelTone = 'gray' | 'green' | 'yellow' | 'red'

export type AmpelPresentation = {
  state: RuleDecisionState
  tone: AmpelTone
  /** Required on screen whenever lamps are not uniformly gray. */
  label: string
  productionAmpel: boolean
  plumbingOnly: boolean
}
