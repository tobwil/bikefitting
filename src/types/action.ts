/** Beginner ActionDecision contract (AP-10). Independent of Ampel URL flags. */

import type { RuleProfileStatus } from './rules.ts'

export const ACTION_DECISION_SCHEMA_VERSION = 1
export const ACTION_DECISION_KIND = 'bikefit.action-decision' as const

export const ACTION_KINDS = ['adjust', 'keep', 'retake', 'review'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const ACTION_AUDIENCES = ['beginner', 'lab'] as const
export type ActionAudience = (typeof ACTION_AUDIENCES)[number]

export const ACTION_PARAMETERS = ['seat_height'] as const
export type ActionParameter = (typeof ACTION_PARAMETERS)[number]

export const ACTION_DIRECTIONS = ['higher', 'lower'] as const
export type ActionDirection = (typeof ACTION_DIRECTIONS)[number]

export const ACTION_LENS_STATUSES = ['validated', 'unvalidated', 'unknown'] as const
export type ActionLensStatus = (typeof ACTION_LENS_STATUSES)[number]

export const ACTION_RELEASE_STATUSES = [
  'approved',
  'provisional',
  'nutzerziel',
  'test_only',
  'retired',
  'missing',
] as const
export type ActionReleaseStatus = (typeof ACTION_RELEASE_STATUSES)[number]

export const ACTION_BLOCK_REASONS = [
  'profile_missing',
  'profile_unreleased',
  'profile_provisional',
  'production_disabled',
  'url_flag_ignored',
  'unsupported_method',
  'method_mismatch',
  'missing_knee',
  'quality_insufficient',
  'unvalidated_lens',
  'contradictory_evidence',
  'pain_reported',
  'unsupported_context',
  'markerless_not_released',
] as const
export type ActionBlockReason = (typeof ACTION_BLOCK_REASONS)[number]

/** Short approved action copy: what / why / how to secure baseline and recheck. */
export type ActionTemplate = {
  what: string
  why: string
  how: string
}

/** Numbers copied from the measurement report. Never inferred millimetres. */
export type ActionReportValues = {
  valueDeg: number | null
  uncertaintyDeg: number | null
  cycles: number | null
  targetDeg: number | null
  lowBoundDeg: number | null
  highBoundDeg: number | null
}

/**
 * Product action for UI and export. `kind: adjust` with a seat parameter is
 * allowed only after fachliche Freigabe. URL `?profile=production` cannot unlock it.
 */
export type ActionDecision = {
  schemaVersion: typeof ACTION_DECISION_SCHEMA_VERSION
  type: typeof ACTION_DECISION_KIND
  /** Product action. `adjust` requires a released matching profile. */
  kind: ActionKind
  captureId: string | null
  analysisId: string | null
  ruleId: string | null
  ruleVersion: number | null
  method: string | null
  /** Fachlicher Freigabestatus of the matched rule profile. */
  releaseStatus: ActionReleaseStatus
  /** True only for approved + productionEnabled + reviewedAt on the rule profile. */
  released: boolean
  productionEnabled: boolean
  evidenceIds: string[]
  parameter: ActionParameter | null
  direction: ActionDirection | null
  template: ActionTemplate
  blockReasons: ActionBlockReason[]
  audience: ActionAudience
  report: ActionReportValues
}

export type ActionDecisionInput = {
  captureId: string | null
  analysisId: string | null
  audience?: ActionAudience
  method: string | null
  metric?: string | null
  valueDeg: number | null
  uncertaintyDeg: number | null
  cycles: number
  kneePresent: boolean
  qualityLevel: 'ok' | 'borderline' | 'insufficient'
  profile: RuleProfileLike | null
  /** Recorded only. Must never unlock beginner seat direction. */
  urlProductionFlag?: boolean
  lensStatus?: ActionLensStatus
  contradiction?: boolean
  painReported?: boolean
  supportedContext?: boolean
  evidenceIds?: string[]
}

/** Rule-profile fields ActionDecision needs. Avoids a hard import cycle at the type layer. */
export type RuleProfileLike = {
  id: string
  schemaVersion: number
  status: RuleProfileStatus
  productionEnabled: boolean
  metric: string
  method: string
  targetDeg: number
  outsideMarginDeg: number
  minCycles: number
  assumedUncertaintyDeg: number
  reviewedAt: string | null
  reviewer?: string | null
}
