import type { MetricBand, MetricBandView, MetricCardModel } from '../types/result.ts'
import type { RuleDecision, RuleMeasurement, RuleMetric, RuleMethod, RuleProfile } from '../types/rules.ts'
import { matchingRuleProfile } from './catalog.ts'
import { decideRule } from './decide.ts'

/** Our knee definition: flexion φ = 180° − inner θ. Not an interior-knee table. */
export const KNEE_FLEXION_DEFINITION =
  'Beugung φ = 180° − Innenwinkel (Hüfte–Knie–Knöchel), sagittale 2D, kameranahe Seite. Nicht der Innenwinkel am Knie.'

export const TRUNK_DEFINITION =
  'Rumpfneigung α: Hüfte→Schulter zur Bike-Horizontalen (+x), gefaltet auf [0, 180). Kein Hüftgelenk.'

export const ELBOW_DEFINITION =
  'Beugung φ = 180° − Innenwinkel (Schulter–Ellbogen–Handgelenk), sagittale 2D, kameranahe Seite.'

export const SPREAD_NOTE =
  'IQR über gültige Zyklen — beobachtete Streuung, keine bewiesene Genauigkeit'

export const PHASE_LABEL: Record<string, string> = {
  bottom_dead_center: 'am tiefsten Pedalpunkt',
  cycle_mean: 'Mittelwert über den Tretzyklus',
  max_extension: 'nahe größter Streckung',
}

const DEFINITION_BY_ID: Record<string, string> = {
  knee_flexion: KNEE_FLEXION_DEFINITION,
  kneeFlexion: KNEE_FLEXION_DEFINITION,
  knee_flexion_cycle_mean: KNEE_FLEXION_DEFINITION,
  kneeFlexionCycleMean: KNEE_FLEXION_DEFINITION,
  torso_lean: TRUNK_DEFINITION,
  trunkTorso: TRUNK_DEFINITION,
  elbow: ELBOW_DEFINITION,
}

export function flowIdToRuleMetric(id: string): RuleMetric | null {
  if (
    id === 'knee_flexion' ||
    id === 'kneeFlexion' ||
    id === 'knee_flexion_cycle_mean' ||
    id === 'kneeFlexionCycleMean'
  ) {
    return 'knee_flexion'
  }
  return null
}

export function asRuleMethod(method: string | null | undefined): RuleMethod | null {
  if (method === 'bottom_dead_center' || method === 'cycle_mean') return method
  // `max_extension` is a measurement method, not a shipped rule method.
  return null
}

export function phaseLabel(method: string | null | undefined): string {
  if (!method) return 'Phase unbekannt'
  return PHASE_LABEL[method] ?? 'Phase unbekannt'
}

export function definitionForCard(id: string): string {
  return DEFINITION_BY_ID[id] ?? 'Eigene Winkeldefinition — kein fremdes Zieltableau.'
}

export function observedUncertaintyDeg(
  profile: RuleProfile,
  spreadDeg: number | null | undefined,
): number {
  if (spreadDeg == null || !Number.isFinite(spreadDeg) || spreadDeg < 0) {
    return profile.assumedUncertaintyDeg
  }
  return Math.max(profile.assumedUncertaintyDeg, spreadDeg)
}

export function bandFromDecision(decision: RuleDecision): MetricBand {
  if (decision.state === 'within_target') return 'in'
  if (decision.state === 'borderline') return 'near'
  if (decision.state === 'outside_target') return 'out'
  return 'unknown'
}

export function decisionTextFor(input: {
  decision: RuleDecision
  profile: RuleProfile | null
  highSpread: boolean
}): string {
  const { decision, profile, highSpread } = input
  const enabled = Boolean(profile?.productionEnabled)
  const lock = enabled ? '' : ' Profil nicht productionEnabled — keine produktive Ampel.'
  const value = decision.valueDeg
  const low = decision.lowBoundDeg
  const high = decision.highBoundDeg
  const valueOutsideBand =
    value != null &&
    low != null &&
    high != null &&
    (value < low - 1e-9 || value > high + 1e-9)

  if (decision.unavailableReason === 'high_spread' || highSpread) {
    if (valueOutsideBand) {
      return `Außerhalb des Zielbands. IQR zu groß für eine Ampel — beobachtete Streuung, keine bewiesene Genauigkeit.${lock}`.trim()
    }
    return `Streuung zu groß für eine Bewertung.${lock}`.trim()
  }
  if (decision.unavailableReason === 'insufficient_cycles') {
    return `Zu wenige gültige Umdrehungen — keine Bewertung.${lock}`.trim()
  }
  if (decision.unavailableReason === 'measurement_invalid') {
    return `Keine gültige Messung.${lock}`.trim()
  }
  if (decision.unavailableReason === 'metric_mismatch' || decision.unavailableReason === 'profile_missing') {
    return `Kein Regelprofil für diese Definition/Phase — dieselbe Zahl gilt nicht für eine andere Bewertung.${lock}`.trim()
  }
  if (decision.state === 'unavailable') {
    return `Bewertung nicht verfügbar.${lock}`.trim()
  }
  if (decision.state === 'within_target') {
    return enabled
      ? 'Im Zielband des hinterlegten Profils.'
      : 'Im Zielband des Profils — deskriptiv, keine produktive Ampel.'
  }
  if (decision.state === 'borderline') {
    return enabled
      ? 'Am Rand des Zielbands.'
      : 'Am Rand des Zielbands — deskriptiv, keine produktive Ampel.'
  }
  return enabled
    ? 'Außerhalb des Zielbands.'
    : 'Außerhalb des Zielbands — deskriptiv, keine produktive Ampel.'
}

export function cardTone(card: MetricCardModel, ampel: boolean): 'in' | 'near' | 'out' | 'plain' {
  if (!ampel) return 'plain'
  if (card.bandView && !card.bandView.scoreable) return 'plain'
  if (card.band === 'unknown') return 'plain'
  return card.band
}

export type PresentMetricCardInput = {
  id: string
  label: string
  value: number | null
  unit?: string
  method: string | null | undefined
  usableCycles: number
  spreadDeg?: number | null
  qualityOk?: boolean
  profile?: RuleProfile | null
  preferredProfileId?: string | null
}

export function presentMetricCard(input: PresentMetricCardInput): MetricCardModel {
  const method = input.method ?? null
  const phase = phaseLabel(method)
  const definition = definitionForCard(input.id)
  const sampleSize = Number.isFinite(input.usableCycles) ? input.usableCycles : 0
  const spreadDeg =
    input.spreadDeg == null || !Number.isFinite(input.spreadDeg) ? null : input.spreadDeg
  const qualityOk = input.qualityOk !== false && input.value != null && Number.isFinite(input.value)
  const ruleMetric = flowIdToRuleMetric(input.id)
  const ruleMethod = asRuleMethod(method)
  const profile =
    input.profile !== undefined
      ? input.profile
      : matchingRuleProfile(ruleMetric, ruleMethod, input.preferredProfileId)

  const measurement: RuleMeasurement | null = qualityOk
    ? {
        metric: ruleMetric ?? ('not_a_metric' as RuleMetric),
        method: ruleMethod ?? 'cycle_mean',
        valueDeg: input.value,
        uncertaintyDeg: profile ? observedUncertaintyDeg(profile, spreadDeg) : spreadDeg,
        cycles: sampleSize,
        valid: true,
      }
    : input.value == null
      ? {
          metric: ruleMetric ?? ('not_a_metric' as RuleMetric),
          method: ruleMethod ?? 'cycle_mean',
          valueDeg: null,
          uncertaintyDeg: profile ? observedUncertaintyDeg(profile, spreadDeg) : spreadDeg,
          cycles: sampleSize,
          valid: false,
        }
      : {
          metric: ruleMetric ?? ('not_a_metric' as RuleMetric),
          method: ruleMethod ?? 'cycle_mean',
          valueDeg: input.value,
          uncertaintyDeg: profile ? observedUncertaintyDeg(profile, spreadDeg) : spreadDeg,
          cycles: sampleSize,
          valid: Boolean(qualityOk),
        }

  const decision = decideRule(profile, measurement)
  const highSpread =
    decision.unavailableReason === 'high_spread' ||
    (profile != null &&
      spreadDeg != null &&
      spreadDeg > profile.outsideMarginDeg)
  const scoreable = decision.state !== 'unavailable' && !highSpread && qualityOk
  const band: MetricBand = scoreable ? bandFromDecision(decision) : 'unknown'
  const decisionText = decisionTextFor({ decision, profile, highSpread })

  const targetHint = profile
    ? `Zielband ${decision.lowBoundDeg?.toFixed(0) ?? '—'}–${decision.highBoundDeg?.toFixed(0) ?? '—'}° · ${phase}`
    : `${phase} · kein Zielprofil`

  const spreadPart =
    spreadDeg == null ? 'IQR —' : `IQR ${spreadDeg.toFixed(1)}° (${SPREAD_NOTE})`
  const detail = `${definition} · ${phase} · n ${sampleSize} · ${spreadPart}`

  const bandView: MetricBandView = {
    definition,
    phase,
    sampleSize,
    spreadDeg,
    spreadNote: SPREAD_NOTE,
    targetDeg: decision.targetDeg,
    targetLowDeg: decision.lowBoundDeg,
    targetHighDeg: decision.highBoundDeg,
    profileId: profile?.id ?? null,
    profileEnabled: Boolean(profile?.productionEnabled),
    decisionState: decision.state,
    decisionText,
    highSpread,
    scoreable,
  }

  return {
    id: input.id,
    label: input.label,
    value: input.value,
    unit: input.unit ?? '°',
    method,
    usableCycles: sampleSize,
    band,
    targetHint,
    detail,
    bandView,
  }
}
