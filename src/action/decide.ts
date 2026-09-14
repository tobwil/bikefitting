import type {
  ActionBlockReason,
  ActionDecision,
  ActionDecisionInput,
  ActionKind,
  ActionTemplate,
  RuleProfileLike,
} from '../types/action.ts'
import { ACTION_DECISION_KIND, ACTION_DECISION_SCHEMA_VERSION } from '../types/action.ts'
import type { RuleDecision, RuleMeasurement, RuleMethod, RuleMetric, RuleProfile } from '../types/rules.ts'
import { decideRule } from '../rules/decide.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'
import {
  COPY,
  assertSafeActionTemplate,
  fillCopy,
  formatReportNumber,
  methodLabel,
  type ActionCopyVars,
} from './copy.ts'
import { isKnownActionMethod } from './observation.ts'
import { isReleasedProfile, releaseStatusOf } from './release.ts'

const RULE_METRICS = new Set(['knee_flexion'])
const RULE_METHODS = new Set(['bottom_dead_center', 'cycle_mean'])

function asRuleProfile(profile: RuleProfileLike | null): RuleProfile | null {
  if (!profile) return null
  return profile as RuleProfile
}

function fillTemplate(base: ActionTemplate, vars: ActionCopyVars): ActionTemplate {
  const filled: ActionTemplate = {
    what: fillCopy(base.what, vars),
    why: fillCopy(base.why, vars),
    how: fillCopy(base.how, vars),
  }
  assertSafeActionTemplate(filled)
  return filled
}

function copyVars(input: ActionDecisionInput, profile: RuleProfileLike | null): ActionCopyVars {
  const low = profile ? profile.targetDeg - profile.outsideMarginDeg : null
  const high = profile ? profile.targetDeg + profile.outsideMarginDeg : null
  return {
    valueDeg: formatReportNumber(input.valueDeg),
    methodLabel: methodLabel(input.method),
    ruleId: profile?.id ?? '—',
    releaseStatus: releaseStatusOf(profile),
    cycles: formatReportNumber(input.cycles),
    targetDeg: formatReportNumber(profile?.targetDeg ?? null),
    lowBound: formatReportNumber(low),
    highBound: formatReportNumber(high),
  }
}

function measurementForRule(
  input: ActionDecisionInput,
  profile: RuleProfileLike,
): RuleMeasurement | null {
  if (!RULE_METRICS.has(profile.metric) || !RULE_METHODS.has(profile.method)) return null
  if (input.method !== profile.method) {
    return {
      metric: profile.metric as RuleMetric,
      method: (input.method && RULE_METHODS.has(input.method)
        ? input.method
        : profile.method) as RuleMethod,
      valueDeg: null,
      uncertaintyDeg: input.uncertaintyDeg,
      cycles: input.cycles,
      valid: false,
    }
  }
  return {
    metric: profile.metric as RuleMetric,
    method: profile.method as RuleMethod,
    valueDeg: input.kneePresent ? input.valueDeg : null,
    uncertaintyDeg: input.uncertaintyDeg,
    cycles: input.cycles,
    valid: input.kneePresent && input.valueDeg != null && Number.isFinite(input.valueDeg),
  }
}

function uniqueReasons(reasons: ActionBlockReason[]): ActionBlockReason[] {
  return [...new Set(reasons)]
}

function beginnerSeatBlocked(reasons: readonly ActionBlockReason[]): boolean {
  return reasons.length > 0
}

/**
 * Pure ActionDecision. Beginner `adjust` only after method + quality +
 * supported context + released profile. URL flags never unlock seat direction.
 */
export function decideAction(input: ActionDecisionInput): ActionDecision {
  const audience = input.audience ?? 'beginner'
  const lensStatus = input.lensStatus ?? 'unknown'
  const supportedContext = input.supportedContext !== false
  const profile = input.profile
  const released = isReleasedProfile(profile)
  const evidenceIds = input.evidenceIds ? [...input.evidenceIds] : []
  const reasons: ActionBlockReason[] = []

  const method = input.method
  const knownMethod = isKnownActionMethod(method)
  const methodMatches = Boolean(profile && method === profile.method && (input.metric ?? 'knee_flexion') === profile.metric)

  if (!input.kneePresent || input.valueDeg == null || !Number.isFinite(input.valueDeg)) {
    reasons.push('missing_knee')
  }
  if (input.qualityLevel !== 'ok') reasons.push('quality_insufficient')
  if (!method || !knownMethod) reasons.push('unsupported_method')
  if (method === 'max_extension' && !released) reasons.push('markerless_not_released')
  if (method && knownMethod && profile && !methodMatches) reasons.push('method_mismatch')
  if (method && knownMethod && !profile) {
    if (method === 'max_extension') reasons.push('markerless_not_released')
    else reasons.push('unsupported_method')
  }
  if (lensStatus !== 'validated') reasons.push('unvalidated_lens')
  if (!supportedContext) reasons.push('unsupported_context')
  if (input.contradiction) reasons.push('contradictory_evidence')
  if (input.painReported) reasons.push('pain_reported')
  if (!profile) reasons.push('profile_missing')
  else {
    if (profile.status === 'provisional') reasons.push('profile_provisional')
    if (profile.productionEnabled !== true) reasons.push('production_disabled')
    if (!released) reasons.push('profile_unreleased')
  }
  if (input.urlProductionFlag === true && !released) reasons.push('url_flag_ignored')

  const blockReasons = uniqueReasons(reasons)
  const vars = copyVars(input, profile)

  let ruleDecision: RuleDecision | null = null
  if (profile && methodMatches) {
    ruleDecision = decideRule(asRuleProfile(profile), measurementForRule(input, profile))
  }

  const report = {
    valueDeg: input.kneePresent && input.valueDeg != null && Number.isFinite(input.valueDeg) ? input.valueDeg : null,
    uncertaintyDeg: input.uncertaintyDeg,
    cycles: Number.isFinite(input.cycles) ? input.cycles : null,
    targetDeg: released ? (profile?.targetDeg ?? null) : null,
    lowBoundDeg: released && profile ? profile.targetDeg - profile.outsideMarginDeg : null,
    highBoundDeg: released && profile ? profile.targetDeg + profile.outsideMarginDeg : null,
  }

  const base = {
    schemaVersion: ACTION_DECISION_SCHEMA_VERSION,
    type: ACTION_DECISION_KIND,
    captureId: input.captureId,
    analysisId: input.analysisId,
    ruleId: profile?.id ?? null,
    ruleVersion: profile?.schemaVersion ?? null,
    method: method ?? null,
    releaseStatus: releaseStatusOf(profile),
    released,
    productionEnabled: profile?.productionEnabled === true,
    evidenceIds,
    audience,
    report,
  } as const

  const retake =
    blockReasons.includes('missing_knee') || blockReasons.includes('quality_insufficient')
  const hardReview =
    input.contradiction ||
    input.painReported ||
    !supportedContext ||
    lensStatus !== 'validated' ||
    blockReasons.includes('unsupported_method') ||
    blockReasons.includes('method_mismatch') ||
    blockReasons.includes('markerless_not_released') ||
    blockReasons.includes('profile_missing') ||
    blockReasons.includes('profile_unreleased') ||
    blockReasons.includes('profile_provisional') ||
    blockReasons.includes('production_disabled')

  function finish(
    kind: ActionKind,
    template: ActionTemplate,
    extras: { parameter?: ActionDecision['parameter']; direction?: ActionDecision['direction'] } = {},
  ): ActionDecision {
    const allowSeat = kind === 'adjust' && released && audience === 'beginner' && !beginnerSeatBlocked(blockReasons)
    const decision: ActionDecision = {
      ...base,
      kind,
      parameter: allowSeat ? (extras.parameter ?? null) : null,
      direction: allowSeat ? (extras.direction ?? null) : null,
      template: fillTemplate(template, vars),
      blockReasons,
    }
    if (kind !== 'adjust') {
      decision.parameter = null
      decision.direction = null
    }
    return decision
  }

  if (audience !== 'beginner') {
    // Lab/expert directional copy stays in RulesPanel. Same contract: no fake release.
    if (retake) {
      return finish(
        'retake',
        blockReasons.includes('missing_knee') ? COPY.retakeMissingKnee : COPY.retakeQuality,
      )
    }
    if (!released) {
      return finish(
        'review',
        report.valueDeg != null ? COPY.reviewUnreleased : COPY.reviewUnreleasedNoValue,
      )
    }
  }

  if (retake) {
    return finish(
      'retake',
      blockReasons.includes('missing_knee') ? COPY.retakeMissingKnee : COPY.retakeQuality,
    )
  }

  if (input.painReported) return finish('review', COPY.reviewPain)
  if (input.contradiction) return finish('review', COPY.reviewContradiction)
  if (blockReasons.includes('markerless_not_released')) return finish('review', COPY.reviewMarkerless)
  if (
    blockReasons.includes('unsupported_method') ||
    blockReasons.includes('method_mismatch')
  ) {
    return finish('review', COPY.reviewUnsupportedMethod)
  }
  if (!released) {
    return finish(
      'review',
      report.valueDeg != null ? COPY.reviewUnreleased : COPY.reviewUnreleasedNoValue,
    )
  }
  if (!supportedContext) return finish('review', COPY.reviewContext)
  if (lensStatus !== 'validated') return finish('review', COPY.reviewLens)
  if (hardReview) {
    return finish('review', COPY.reviewGeneric)
  }

  if (!ruleDecision || ruleDecision.state === 'unavailable') {
    const reason = ruleDecision?.unavailableReason
    if (reason === 'insufficient_cycles' || reason === 'measurement_invalid' || reason === 'high_spread') {
      return finish('retake', COPY.retakeQuality)
    }
    return finish('keep', COPY.keepUnavailable)
  }

  if (ruleDecision.state === 'within_target') {
    return finish('keep', COPY.keepWithin)
  }

  const direction = ruleDecision.side === 'high' ? 'higher' : ruleDecision.side === 'low' ? 'lower' : null
  if (!direction) return finish('keep', COPY.keepWithin)

  return finish(ruleDecision.side === 'high' ? 'adjust' : 'adjust', direction === 'higher' ? COPY.adjustHigher : COPY.adjustLower, {
    parameter: 'seat_height',
    direction,
  })
}

export function matchingActionProfile(
  metric: string | null | undefined,
  method: string | null | undefined,
): RuleProfileLike | null {
  return matchingRuleProfile(metric, method)
}

export function beginnerSeatAction(decision: ActionDecision): boolean {
  return (
    decision.audience === 'beginner' &&
    decision.kind === 'adjust' &&
    decision.released &&
    decision.parameter === 'seat_height' &&
    decision.direction != null
  )
}
