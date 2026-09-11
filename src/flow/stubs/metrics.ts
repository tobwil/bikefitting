import { computeLiveCards } from '../liveMetrics.ts'
import type { LiveMetricInput, MetricsApi } from '../contracts.ts'
import type { QualityReport } from '../types.ts'

function qualityFrom(input: {
  validRevs: number
  targetRevs: number
  lostFrames: number
}): QualityReport {
  const notes: string[] = []
  if (input.validRevs < 1) notes.push('Keine gültige Umdrehung erfasst.')
  else if (input.validRevs < input.targetRevs) {
    notes.push(`Nur ${input.validRevs} von ${input.targetRevs} gültigen Umdrehungen.`)
  }
  if (input.lostFrames > 12) notes.push('Pedalmarker mehrfach verloren.')

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

export const stubMetrics: MetricsApi = {
  source: 'stub',
  liveCards(input: LiveMetricInput) {
    return computeLiveCards({
      frame: input.pose,
      kneeDegrees: input.kneeDegrees,
      kneeVisible: input.kneeVisible,
    })
  },
  quality(input) {
    return qualityFrom(input)
  },
}
