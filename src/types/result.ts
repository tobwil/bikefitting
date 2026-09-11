import type { BikeCalibration } from './calibration.ts'

/** On-disk / export shape of the immutable measurement dataset. Bump when the payload changes. */
export const MEASUREMENT_RESULT_SCHEMA_VERSION = 1

export const RESULT_EXPORT_KIND = 'bikefit.measurement-result'

/** Product/release channel. Independent of quality and of demo/live evaluation. */
export const PRODUCT_RELEASE_P0 = 'p0'

export const CAPTURE_SOURCES = ['camera', 'synthetic'] as const
export type CaptureSource = (typeof CAPTURE_SOURCES)[number]

/** How the result was produced. Demo is labeled independently of capture and of quality. */
export const EVALUATION_SOURCES = ['standard', 'demo'] as const
export type EvaluationSource = (typeof EVALUATION_SOURCES)[number]

export type ResultProfile = {
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
}

export type Recommendation = {
  priority: number
  title: string
  reason: string
  metricId?: string
  deltaHint?: string
}

export type ResultProvenance = {
  /** Video/capture path. Not the same as evaluation or quality. */
  capture: CaptureSource
  /** standard = product path; demo = Demo-Auswertung. Independent of quality. */
  evaluation: EvaluationSource
  /** Shipped product/release id, e.g. `p0`. Independent of demo and of quality. */
  productRelease: string
}

export type ResultTimeRange = {
  startedAt: string
  endedAt: string
}

export type ResultRuleVersion = {
  id: string
  schemaVersion: number
  status: string
  productionEnabled: boolean
  method: string
}

export type ResultMethod = {
  metrics: string
  rules: string
  aggregation: string
  calibration: string
}

export type AdapterSource = 'module' | 'stub' | 'mixed'

/**
 * Full immutable dataset created when a recording ends.
 * Display, save, and export read only this object. Remeasure creates a new one.
 */
export type MeasurementResult = {
  schemaVersion: typeof MEASUREMENT_RESULT_SCHEMA_VERSION
  id: string
  createdAt: string
  time: ResultTimeRange
  provenance: ResultProvenance
  profile: ResultProfile
  ruleVersions: ResultRuleVersion[]
  method: ResultMethod
  calibration: BikeCalibration
  metrics: MetricCardModel[]
  quality: QualityReport
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  adapters: Record<string, AdapterSource>
}

export function isDemoResult(result: MeasurementResult | null | undefined): boolean {
  return result?.provenance.evaluation === 'demo'
}
