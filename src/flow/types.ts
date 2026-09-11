export type { FlowStepId } from './constants.ts'
export type {
  AdapterSource,
  CaptureSource,
  EvaluationSource,
  MeasurementResult,
  MetricBand,
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
export { isDemoResult } from '../types/result.ts'

import type { MeasurementResult, ResultProfile } from '../types/result.ts'

export type FitProfile = ResultProfile

/** Persisted journey row. Display/save/export use `result` only. */
export type SavedSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  result: MeasurementResult
}

export type MeasurePhase = 'idle' | 'countdown' | 'running' | 'complete'

export type BodyCheck = {
  id: string
  label: string
  hint: string
  ok: boolean
}
