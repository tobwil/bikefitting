import type { BikeCalibration } from './calibration.ts'
import type { PhaseEvidence } from './phase.ts'

/** On-disk / export shape of the immutable measurement dataset. Bump when the payload changes. */
export const MEASUREMENT_RESULT_SCHEMA_VERSION = 1

export const RESULT_EXPORT_KIND = 'bikefit.measurement-result'

/** Product/release channel. Independent of quality and of demo/live evaluation. */
export const PRODUCT_RELEASE_P0 = 'p0'

export const CAPTURE_SOURCES = ['camera', 'synthetic', 'file'] as const
export type CaptureSource = (typeof CAPTURE_SOURCES)[number]

/** How the result was produced. Demo is labeled independently of capture and of quality. */
export const EVALUATION_SOURCES = ['standard', 'demo'] as const
export type EvaluationSource = (typeof EVALUATION_SOURCES)[number]

/**
 * Frozen, file-identifiable source on the result object.
 * Demo wins over capture so an exported file is labeled without browser context.
 */
export const RESULT_SOURCES = ['camera', 'synthetic', 'demo', 'file'] as const
export type ResultSource = (typeof RESULT_SOURCES)[number]

export function frozenResultSource(capture: CaptureSource, evaluation: EvaluationSource): ResultSource {
  return evaluation === 'demo' ? 'demo' : capture
}

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
  /** Copied from the metric. UI must not invent a method. */
  method?: string | null
  usableCycles?: number
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
  trackingLevel?: QualityLevel
  requiredMetricsOk?: boolean
  usableCycles?: Record<string, number>
  measurementId?: string | null
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
  /** File/media clock range in milliseconds. Absent on live camera takes. */
  mediaStartMs?: number
  mediaEndMs?: number
}

export type ResultFileKind = 'video' | 'image'

export type ResultFileCrop = {
  x: number
  y: number
  width: number
  height: number
}

/** Frozen local-file provenance. Bytes never leave the machine. */
export type ResultFileSource = {
  kind: ResultFileKind
  name: string
  mimeType: string
  width: number
  height: number
  durationMs: number | null
  mediaTimeRangeMs: { start: number; end: number }
  staticCheck: boolean
  rotationDeg: 0 | 90 | 180 | 270
  crop: ResultFileCrop | null
  upload: false
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
  /** Frozen capture/eval label. Not the live camera and not quality. */
  source: ResultSource
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
  /** Present when capture is a local file. Never includes bytes or object URLs. */
  file?: ResultFileSource | null
  /**
   * Optional crank-phase stills frozen at recording end.
   * Display reads this object — never regenerated from live calibration.
   */
  phaseEvidence?: PhaseEvidence | null
}

export function isDemoResult(result: MeasurementResult | null | undefined): boolean {
  return result?.source === 'demo' || result?.provenance.evaluation === 'demo'
}

export function isSyntheticCapture(result: MeasurementResult | null | undefined): boolean {
  return result?.provenance.capture === 'synthetic' || result?.source === 'synthetic'
}

export function isFileCapture(result: MeasurementResult | null | undefined): boolean {
  return result?.provenance.capture === 'file' || result?.source === 'file'
}
