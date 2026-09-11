import type { MetricId, MetricResult, MetricsReport } from '../types/metrics.ts'
import { PRIMARY_METRIC_IDS } from '../types/metrics.ts'
import { presentMetricCard } from '../rules/metricCard.ts'
import type { LiveMetricInput, MetricsApi } from './contracts.ts'
import type { MetricCardModel, QualityLevel, QualityReport } from './types.ts'
import { qualityLabel } from './types.ts'
import { MAX_LIVE_METRIC_CARDS } from './constants.ts'

const LABELS: Record<MetricId, string> = {
  kneeFlexion: 'Kniebeugung',
  kneeFlexionCycleMean: 'Kniebeugung (Zyklusmittel)',
  trunkTorso: 'Rumpf / Torso',
  elbow: 'Ellbogenbeugung',
}

const FLOW_IDS: Record<MetricId, string> = {
  kneeFlexion: 'knee_flexion',
  kneeFlexionCycleMean: 'knee_flexion_cycle_mean',
  trunkTorso: 'torso_lean',
  elbow: 'elbow',
}

/** Product quality requires a usable BDC knee metric — not pedal revs alone. */
export const REQUIRED_FLOW_METRIC_IDS = ['knee_flexion'] as const

function cardFromMetric(metric: MetricResult): MetricCardModel {
  const value = metric.quality === 'ok' && metric.degrees ? metric.degrees.median : null
  return presentMetricCard({
    id: FLOW_IDS[metric.id],
    label: LABELS[metric.id],
    value,
    unit: '°',
    method: metric.method,
    usableCycles: metric.usableCycles,
    spreadDeg: metric.degrees?.spread ?? null,
    qualityOk: metric.quality === 'ok' && metric.degrees != null,
  })
}

export function cardsFromReport(report: MetricsReport): MetricCardModel[] {
  return PRIMARY_METRIC_IDS.map((id) => cardFromMetric(report.metrics[id])).slice(
    0,
    MAX_LIVE_METRIC_CARDS,
  )
}

function trackingLevelOf(validRevs: number, targetRevs: number, lostFrames: number): QualityLevel {
  if (validRevs < 1) return 'insufficient'
  if (validRevs < Math.max(3, Math.ceil(targetRevs * 0.5)) || lostFrames > 12) return 'borderline'
  return 'ok'
}

function requiredKneeOk(input: {
  cards: MetricCardModel[]
  report?: MetricsReport | null
}): { ok: boolean; usable: number; method: string | null } {
  const knee = input.report?.metrics.kneeFlexion
  if (knee) {
    return {
      ok: knee.quality === 'ok' && knee.method === 'bottom_dead_center' && knee.usableCycles > 0,
      usable: knee.usableCycles,
      method: knee.method,
    }
  }
  const card = input.cards.find((item) => item.id === 'knee_flexion' || item.id === 'kneeFlexion')
  return {
    ok: card?.value != null && Number.isFinite(card.value) && card.method === 'bottom_dead_center',
    usable: card?.usableCycles ?? 0,
    method: card?.method ?? null,
  }
}

export function qualityFromReport(input: {
  cards: MetricCardModel[]
  validRevs: number
  targetRevs: number
  lostFrames: number
  report?: MetricsReport | null
  measurementId?: string | null
}): QualityReport {
  const notes: string[] = []
  const trackingLevel = trackingLevelOf(input.validRevs, input.targetRevs, input.lostFrames)
  const required = requiredKneeOk(input)

  const usableCycles: Record<string, number> = {}
  if (input.report) {
    usableCycles.knee_flexion = input.report.metrics.kneeFlexion.usableCycles
    usableCycles.knee_flexion_cycle_mean = input.report.metrics.kneeFlexionCycleMean.usableCycles
    usableCycles.torso_lean = input.report.metrics.trunkTorso.usableCycles
    usableCycles.elbow = input.report.metrics.elbow.usableCycles
  } else {
    for (const card of input.cards) usableCycles[card.id] = card.usableCycles ?? 0
  }

  if (input.validRevs < 1) notes.push('Keine gültige Kurbelumdrehung.')
  else if (input.validRevs < input.targetRevs) {
    notes.push(`Nur ${input.validRevs} von ${input.targetRevs} gültigen Umdrehungen.`)
  }
  if (input.lostFrames > 12) notes.push('Pedalmarker mehrfach verloren.')
  if (!required.ok) {
    notes.push(
      required.method && required.method !== 'bottom_dead_center'
        ? 'Kniebeugung liegt nicht am tiefsten Pedalpunkt vor.'
        : 'Erforderliche Metrik Kniebeugung am tiefsten Pedalpunkt fehlt oder ist nicht verwendbar.',
    )
  }
  const missing = input.cards.filter((c) => c.value === null)
  if (missing.length > 0) {
    notes.push(`${missing.map((c) => c.label).join(', ')} ohne gültige Zahl.`)
  }

  const level: QualityLevel = required.ok ? trackingLevel : 'insufficient'

  return {
    level,
    label: qualityLabel(level),
    validRevs: input.validRevs,
    targetRevs: input.targetRevs,
    lostFrames: input.lostFrames,
    notes,
    trackingLevel,
    requiredMetricsOk: required.ok,
    usableCycles,
    measurementId: input.measurementId ?? null,
  }
}

export const realMetrics: MetricsApi = {
  source: 'module',
  liveCards(input: LiveMetricInput) {
    if (input.report) return cardsFromReport(input.report)
    return PRIMARY_METRIC_IDS.map((id) =>
      cardFromMetric({
        id,
        method: id === 'kneeFlexion' ? 'bottom_dead_center' : 'cycle_mean',
        unit: 'deg',
        quality: 'unavailable',
        reasons: ['too_few_cycles'],
        degrees: null,
        usableCycles: 0,
      }),
    ).slice(0, MAX_LIVE_METRIC_CARDS)
  },
  quality(input) {
    return qualityFromReport(input)
  },
}
