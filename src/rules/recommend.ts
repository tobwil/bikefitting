import type {
  RuleDecision,
  RuleProfile,
  RuleRecommendation,
  RuleUnavailableReason,
} from '../types/rules.ts'
import { assertSafeRecommendation } from './schema.ts'

const UNAVAILABLE_OBSERVATION: Record<RuleUnavailableReason, string> = {
  profile_missing: 'Es ist kein Regelprofil geladen.',
  profile_invalid: 'Das Regelprofil ist ungültig und darf nicht bewerten.',
  measurement_invalid: 'Die Messung ist ungültig oder die Kniebeugung ist nicht sichtbar.',
  insufficient_cycles:
    'Es liegen {cycles} Kurbelumdrehungen vor; benötigt werden mindestens {minCycles}.',
  metric_mismatch: 'Messung und Profil sprechen nicht dieselbe Größe (Metrik/Methode).',
  uncertainty_missing: 'Ohne Unsicherheit in Grad ist kein Vergleich mit dem Zielband möglich.',
}

export type RecommendationVars = {
  valueDeg: string
  targetDeg: string
  uncertaintyDeg: string
  lowBound: string
  highBound: string
  cycles: string
  minCycles: string
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function recommendationVars(decision: RuleDecision, profile: RuleProfile | null): RecommendationVars {
  return {
    valueDeg: fmt(decision.valueDeg),
    targetDeg: fmt(decision.targetDeg ?? profile?.targetDeg),
    uncertaintyDeg: fmt(decision.uncertaintyDeg ?? profile?.assumedUncertaintyDeg),
    lowBound: fmt(decision.lowBoundDeg),
    highBound: fmt(decision.highBoundDeg),
    cycles: fmt(decision.cycles),
    minCycles: fmt(decision.minCycles ?? profile?.minCycles),
  }
}

export function fillTemplate(template: string, vars: RecommendationVars): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => {
    if (key in vars) return vars[key as keyof RecommendationVars]
    return whole
  })
}

function fillRecommendation(rec: RuleRecommendation, vars: RecommendationVars): RuleRecommendation {
  const filled: RuleRecommendation = {
    observation: fillTemplate(rec.observation, vars),
    possibleCause: fillTemplate(rec.possibleCause, vars),
    prerequisite: fillTemplate(rec.prerequisite, vars),
    nextStep: fillTemplate(rec.nextStep, vars),
    remeasure: fillTemplate(rec.remeasure, vars),
  }
  assertSafeRecommendation(filled)
  return filled
}

function pickCopy(profile: RuleProfile, decision: RuleDecision): RuleRecommendation {
  if (decision.state === 'unavailable') {
    const base = profile.copy.unavailable
    const reason = decision.unavailableReason
    if (!reason) return base
    return {
      ...base,
      observation: UNAVAILABLE_OBSERVATION[reason],
    }
  }
  if (decision.state === 'within_target') return profile.copy.within
  const high = decision.side !== 'low'
  if (decision.state === 'borderline') {
    return high ? profile.copy.borderlineHigh : profile.copy.borderlineLow
  }
  return high ? profile.copy.outsideHigh : profile.copy.outsideLow
}

const FALLBACK_UNAVAILABLE: RuleRecommendation = {
  observation: 'Keine Bewertung möglich.',
  possibleCause: 'Profil oder Messung fehlen.',
  prerequisite: 'Ein gültiges Profil und eine gültige Messung.',
  nextStep: 'Keine Satteländerung raten.',
  remeasure: 'Voraussetzungen erfüllen, dann erneut messen.',
}

/**
 * Plan §10.4 structure: Beobachtung → mögliche Erklärung → Voraussetzung →
 * nächster Schritt → erneut messen. Deterministic; no LLM.
 */
export function recommendRule(
  profile: RuleProfile | null,
  decision: RuleDecision,
): RuleRecommendation {
  const vars = recommendationVars(decision, profile)
  if (!profile) {
    const reason = decision.unavailableReason ?? 'profile_missing'
    return fillRecommendation(
      {
        ...FALLBACK_UNAVAILABLE,
        observation: UNAVAILABLE_OBSERVATION[reason],
      },
      vars,
    )
  }
  return fillRecommendation(pickCopy(profile, decision), vars)
}

export function formatRecommendation(rec: RuleRecommendation): string {
  return [
    `Beobachtung: ${rec.observation}`,
    `Mögliche Erklärung: ${rec.possibleCause}`,
    `Voraussetzung: ${rec.prerequisite}`,
    `Nächster Schritt: ${rec.nextStep}`,
    `Erneut messen: ${rec.remeasure}`,
  ].join('\n')
}
