import { DEFAULT_RULE_PROFILE_ID, getRuleProfile, matchingRuleProfile } from '../rules/catalog.ts'
import { decideRule } from '../rules/decide.ts'
import { presentAmpel } from '../rules/display.ts'
import { recommendRule } from '../rules/recommend.ts'
import { decideAction } from '../action/decide.ts'
import { recommendationsFromAction } from '../action/recommendations.ts'
import { readKneeObservation } from '../action/observation.ts'
import type { ActionAudience, ActionDecision, ActionLensStatus } from '../types/action.ts'
import type { MetricsReport } from '../types/metrics.ts'
import type { RuleMeasurement, RuleMethod } from '../types/rules.ts'
import type { RulesApi } from './contracts.ts'
import type { MetricCardModel, QualityReport, Recommendation } from './types.ts'

function kneeCard(cards: MetricCardModel[]) {
  return cards.find((c) => c.id === 'knee_flexion' || c.id === 'kneeFlexion')
}

function ruleMethodOf(method: string | null | undefined): RuleMethod {
  if (method === 'bottom_dead_center') return 'bottom_dead_center'
  return 'cycle_mean'
}

/**
 * Build the rule measurement from the metric — never invent BDC.
 * Cycles are the metric's usable count, not pedal revolutions.
 */
export function measurementFromKnee(input: {
  cards: MetricCardModel[]
  report?: MetricsReport | null
  quality?: QualityReport
}): RuleMeasurement {
  const knee = input.report?.metrics.kneeFlexion
  const card = kneeCard(input.cards)
  const method = knee?.method ?? card?.method ?? null
  const usable = knee?.usableCycles ?? card?.usableCycles ?? 0
  const value =
    knee?.quality === 'ok' && knee.degrees
      ? knee.degrees.median
      : card?.method === 'bottom_dead_center'
        ? (card.value ?? null)
        : null
  const matches = method === 'bottom_dead_center'
  return {
    metric: 'knee_flexion',
    method: ruleMethodOf(method),
    valueDeg: matches ? value : null,
    uncertaintyDeg: knee?.degrees?.spread ?? card?.bandView?.spreadDeg ?? null,
    cycles: usable,
    valid: matches && value != null && Number.isFinite(value) && (knee ? knee.quality === 'ok' : true),
  }
}

export type FlowActionInput = {
  cards: MetricCardModel[]
  quality: QualityReport
  productionEnabled: boolean
  report?: MetricsReport | null
  captureId?: string | null
  analysisId?: string | null
  evidenceIds?: string[]
  lensStatus?: ActionLensStatus
  contradiction?: boolean
  painReported?: boolean
  supportedContext?: boolean
  audience?: ActionAudience
}

/** Beginner ActionDecision from flow cards/report. URL productionEnabled never unlocks seat direction. */
export function decideActionFromFlow(input: FlowActionInput): ActionDecision {
  const observed = readKneeObservation({ cards: input.cards, report: input.report })
  const profile = matchingRuleProfile('knee_flexion', observed.method)
  return decideAction({
    captureId: input.captureId ?? input.quality.measurementId ?? null,
    analysisId: input.analysisId ?? input.quality.measurementId ?? null,
    audience: input.audience ?? 'beginner',
    method: observed.method,
    metric: 'knee_flexion',
    valueDeg: observed.valueDeg,
    uncertaintyDeg: observed.uncertaintyDeg,
    cycles: observed.cycles,
    kneePresent: observed.kneePresent,
    qualityLevel: input.quality.level,
    profile,
    urlProductionFlag: input.productionEnabled,
    lensStatus: input.lensStatus ?? 'unknown',
    contradiction: input.contradiction === true,
    painReported: input.painReported === true,
    supportedContext: input.supportedContext !== false,
    evidenceIds: input.evidenceIds,
  })
}

export const realRules: RulesApi = {
  source: 'module',
  recommend(input) {
    const action = decideActionFromFlow(input)
    const recs = recommendationsFromAction(action)
    if (input.audience === 'lab') {
      return labRecommendations(input, recs)
    }
    return recs
  },
}

function labRecommendations(
  input: FlowActionInput,
  beginnerRecs: Recommendation[],
): Recommendation[] {
  const profile = getRuleProfile(DEFAULT_RULE_PROFILE_ID)
  const measurement = measurementFromKnee({
    cards: input.cards,
    report: input.report,
    quality: input.quality,
  })
  const decision = decideRule(profile, measurement)
  const copy = recommendRule(profile, decision)
  const ampel = presentAmpel(profile, decision, false)
  const labeled = `Labor / nicht Einsteiger. ${ampel.label}`
  return [
    {
      priority: 1,
      title: copy.nextStep,
      reason: [copy.observation, copy.possibleCause, copy.prerequisite, copy.remeasure, labeled].join(' '),
      metricId: 'knee_flexion',
    },
    ...beginnerRecs.slice(0, 1).map((item) => ({
      ...item,
      priority: 2,
      title: `Einsteiger: ${item.title}`,
    })),
  ].slice(0, 3)
}
