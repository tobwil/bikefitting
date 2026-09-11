import { DEFAULT_RULE_PROFILE_ID, getRuleProfile, shippedProductionProfiles } from '../rules/catalog.ts'
import { decideRule } from '../rules/decide.ts'
import { presentAmpel } from '../rules/display.ts'
import { recommendRule } from '../rules/recommend.ts'
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
    uncertaintyDeg: null,
    cycles: usable,
    valid: matches && value != null && Number.isFinite(value) && (knee ? knee.quality === 'ok' : true),
  }
}

export const realRules: RulesApi = {
  source: 'module',
  recommend({ cards, quality, productionEnabled, report }) {
    const profile = getRuleProfile(DEFAULT_RULE_PROFILE_ID)
    const measurement = measurementFromKnee({ cards, report, quality })
    const decision = decideRule(profile, measurement)
    const copy = recommendRule(profile, decision)
    const ampel = presentAmpel(profile, decision, false)
    const descriptiveOnly = decision.state === 'unavailable'

    const recs: Recommendation[] = [
      {
        priority: 1,
        title: copy.nextStep,
        reason: [copy.observation, copy.possibleCause, copy.prerequisite, copy.remeasure].join(' '),
        metricId: 'knee_flexion',
      },
    ]

    if (quality.level !== 'ok' || descriptiveOnly) {
      recs.push({
        priority: 2,
        title: 'Erneut messen',
        reason: quality.notes[0] ?? copy.remeasure,
      })
    }

    const productive =
      productionEnabled && ampel.productionAmpel && shippedProductionProfiles().length > 0
    if (!productive) {
      return recs.slice(0, 3).map((item) => ({
        ...item,
        reason: `${item.reason} Keine produktive Ampel (kein productionEnabled-Profil).`,
      }))
    }
    return recs.slice(0, 3)
  },
}
