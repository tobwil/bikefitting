import type { MetricId, MetricResult, MetricsReport } from '../types/metrics.ts'
import { METRIC_IDS } from '../types/metrics.ts'
import type { LiveMetricInput, MetricsApi } from './contracts.ts'
import type { MetricBand, MetricCardModel, QualityReport } from './types.ts'
import { MAX_LIVE_METRIC_CARDS } from './constants.ts'

const LABELS: Record<MetricId, string> = {
  kneeFlexion: 'Kniebeugung',
  trunkTorso: 'Rumpf / Torso',
  elbow: 'Ellbogenbeugung',
}

const FLOW_IDS: Record<MetricId, string> = {
  kneeFlexion: 'knee_flexion',
  trunkTorso: 'torso_lean',
  elbow: 'elbow',
}

function bandFor(metric: MetricResult): MetricBand {
  if (metric.quality !== 'ok' || !metric.degrees) return 'unknown'
  return 'in'
}

function cardFromMetric(metric: MetricResult): MetricCardModel {
  const value = metric.quality === 'ok' && metric.degrees ? metric.degrees.median : null
  const detail =
    metric.quality === 'ok' && metric.degrees
      ? `µ ${metric.degrees.mean.toFixed(1)} · IQR ${metric.degrees.spread.toFixed(1)} · n ${metric.degrees.n}`
      : metric.reasons.join(', ') || 'unavailable'
  return {
    id: FLOW_IDS[metric.id],
    label: LABELS[metric.id],
    value,
    unit: '°',
    band: bandFor(metric),
    targetHint: metric.quality === 'ok' ? 'Numerisch über gültige Zyklen' : 'Keine Zahl — Messung ungültig',
    detail,
  }
}

export function cardsFromReport(report: MetricsReport): MetricCardModel[] {
  return METRIC_IDS.map((id) => cardFromMetric(report.metrics[id])).slice(0, MAX_LIVE_METRIC_CARDS)
}

function qualityFrom(input: {
  cards: MetricCardModel[]
  validRevs: number
  targetRevs: number
  lostFrames: number
}): QualityReport {
  const notes: string[] = []
  if (input.validRevs < 1) notes.push('Keine gültige Kurbelumdrehung in der Messpipeline.')
  else if (input.validRevs < input.targetRevs) {
    notes.push(`Nur ${input.validRevs} von ${input.targetRevs} gültigen Umdrehungen.`)
  }
  if (input.lostFrames > 12) notes.push('Pedalmarker mehrfach verloren.')
  const missing = input.cards.filter((c) => c.value === null)
  if (missing.length > 0) {
    notes.push(`${missing.map((c) => c.label).join(', ')} ohne gültige Zahl.`)
  }

  let level: QualityReport['level'] = 'ok'
  if (input.validRevs < 1) level = 'insufficient'
  else if (input.validRevs < Math.max(3, Math.ceil(input.targetRevs * 0.5)) || input.lostFrames > 12) {
    level = 'borderline'
  }

  const label =
    level === 'ok' ? 'Qualität ausreichend' : level === 'borderline' ? 'Qualität grenzwertig' : 'Qualität unzureichend'

  return {
    level,
    label,
    validRevs: input.validRevs,
    targetRevs: input.targetRevs,
    lostFrames: input.lostFrames,
    notes,
  }
}

export const realMetrics: MetricsApi = {
  source: 'module',
  liveCards(input: LiveMetricInput) {
    if (input.report) return cardsFromReport(input.report)
    return METRIC_IDS.map((id) =>
      cardFromMetric({
        id,
        quality: 'unavailable',
        reasons: ['too_few_cycles'],
        degrees: null,
      }),
    ).slice(0, MAX_LIVE_METRIC_CARDS)
  },
  quality(input) {
    return qualityFrom(input)
  },
}
