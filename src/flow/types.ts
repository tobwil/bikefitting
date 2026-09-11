import type { BikeCalibration } from '../types/calibration.ts'
import type { CaptureState } from '../types/metrics.ts'
import type { FlowStepId } from './constants.ts'

export type { FlowStepId }

export type AdapterSource = 'module' | 'stub' | 'mixed'

export type FitProfile = {
  id: string
  name: string
  productionEnabled: boolean
}

export type MetricBand = 'in' | 'near' | 'out' | 'unknown'

export type MetricCardModel = {
  id: string
  label: string
  value: number | null
  unit: string
  /** Copied from the metric. UI must not invent a method. */
  method: string | null
  usableCycles: number
  band: MetricBand
  targetHint: string
  detail?: string
}

export type QualityLevel = 'ok' | 'borderline' | 'insufficient'

export type QualityReport = {
  level: QualityLevel
  label: string
  validRevs: number
  targetRevs: number
  lostFrames: number
  notes: string[]
  /** Pedal-tracking quality only — not per-metric usability. */
  trackingLevel: QualityLevel
  requiredMetricsOk: boolean
  usableCycles: Record<string, number>
  measurementId: string | null
}

export type Recommendation = {
  priority: number
  title: string
  reason: string
  metricId?: string
  deltaHint?: string
}

export type SavedSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  profile: FitProfile
  quality: QualityReport
  metrics: MetricCardModel[]
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  measurementId: string | null
  calibration: BikeCalibration
  adapters: Record<string, AdapterSource>
}

export type MeasurePhase = CaptureState

export type BodyCheck = {
  id: string
  label: string
  hint: string
  ok: boolean
}

export function qualityLabel(level: QualityLevel): string {
  if (level === 'ok') return 'Qualität ausreichend'
  if (level === 'borderline') return 'Qualität grenzwertig'
  return 'Qualität unzureichend'
}

export function emptyQualityExtras(): Pick<
  QualityReport,
  'trackingLevel' | 'requiredMetricsOk' | 'usableCycles' | 'measurementId'
> {
  return {
    trackingLevel: 'insufficient',
    requiredMetricsOk: false,
    usableCycles: {},
    measurementId: null,
  }
}
