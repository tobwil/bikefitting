import { DEFAULT_RULE_PROFILE_ID, getRuleProfile, shippedProductionProfiles } from '../rules/catalog.ts'
import { decideRule } from '../rules/decide.ts'
import { presentAmpel } from '../rules/display.ts'
import { recommendRule } from '../rules/recommend.ts'
import type { RulesApi } from './contracts.ts'
import type { Recommendation } from './types.ts'

function kneeCard(cards: { id: string; value: number | null }[]) {
  return cards.find((c) => c.id === 'knee_flexion' || c.id === 'kneeFlexion')
}

export const realRules: RulesApi = {
  source: 'module',
  recommend({ cards, quality, productionEnabled }) {
    const profile = getRuleProfile(DEFAULT_RULE_PROFILE_ID)
    const knee = kneeCard(cards)
    const decision = decideRule(profile, {
      metric: 'knee_flexion',
      method: 'bottom_dead_center',
      valueDeg: knee?.value ?? null,
      uncertaintyDeg: null,
      cycles: quality.validRevs,
      valid: knee?.value != null && Number.isFinite(knee.value) && quality.level !== 'insufficient',
    })
    const copy = recommendRule(profile, decision)
    const ampel = presentAmpel(profile, decision, false)
    const recs: Recommendation[] = [
      {
        priority: 1,
        title: copy.nextStep,
        reason: [copy.observation, copy.possibleCause, copy.prerequisite, copy.remeasure].join(' '),
        metricId: 'knee_flexion',
      },
    ]

    if (quality.level !== 'ok') {
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
        reason: `${item.reason} Keine farbige Bewertung in dieser Version.`,
      }))
    }
    return recs.slice(0, 3)
  },
}
