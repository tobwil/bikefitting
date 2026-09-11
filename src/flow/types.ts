export type { FlowStepId } from './constants.ts'
export type {
  AdapterSource,
  CaptureSource,
  EvaluationSource,
  ResultSource,
  MeasurementResult,
  MetricBand,
  MetricBandView,
  MetricCardModel,
  QualityLevel,
  QualityReport,
  Recommendation,
  ResultMethod,
  ResultProfile,
  ResultProvenance,
  ResultRuleVersion,
  ResultTimeRange,
} from '../types/result.ts'
export { isDemoResult, isSyntheticCapture, isFileCapture } from '../types/result.ts'

import type { CaptureState } from '../types/metrics.ts'
import type { MeasurementResult, QualityLevel, QualityReport, ResultProfile } from '../types/result.ts'

export type JourneyKind = 'camera' | 'demo' | 'file'

export type FitProfile = ResultProfile

/** Persisted journey row. Display/save/export use `result` only. */
export type SavedSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  result: MeasurementResult
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
