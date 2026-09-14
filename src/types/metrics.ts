import type { PixelBikeTransform } from './calibration.ts'
import type { PoseFrame } from './landmarks.ts'
import type { PedalSample } from './pedal.ts'

export const METRIC_IDS = ['kneeFlexion', 'kneeFlexionCycleMean', 'trunkTorso', 'elbow'] as const
export type MetricId = (typeof METRIC_IDS)[number]

/** Cards / quality required for a product measurement. Cycle-mean is extra. */
export const PRIMARY_METRIC_IDS = ['kneeFlexion', 'trunkTorso', 'elbow'] as const
export type PrimaryMetricId = (typeof PRIMARY_METRIC_IDS)[number]

/**
 * How the number was computed. UI must display this field — it must not
 * invent `bottom_dead_center` for a cycle-mean, max-extension, or the reverse.
 * `max_extension` is the markerless beginner method (AP-05). It is not BDC.
 */
export const METRIC_METHODS = ['bottom_dead_center', 'cycle_mean', 'max_extension'] as const
export type MetricMethod = (typeof METRIC_METHODS)[number]

export const METRIC_UNITS = ['deg'] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

export const METRIC_METHOD_BY_ID: Record<MetricId, MetricMethod> = {
  kneeFlexion: 'bottom_dead_center',
  kneeFlexionCycleMean: 'cycle_mean',
  trunkTorso: 'cycle_mean',
  elbow: 'cycle_mean',
}

/**
 * Machine-readable why a metric is `unavailable`.
 * Not a quality score and not Ampel — either the number exists or it does not.
 */
export type MetricUnavailableReason =
  | 'visibility'
  | 'phase_loss'
  | 'too_few_cycles'
  | 'insufficient_bdc'

export type MetricQuality = 'ok' | 'unavailable'

/** Mean / median / IQR of per-cycle values. Degrees. No Ampel band. */
export type MetricStats = {
  mean: number
  median: number
  spread: number
  min: number
  max: number
  n: number
}

export type MetricResult = {
  id: MetricId
  method: MetricMethod
  /** Versioned algorithm id, e.g. `max_extension.p10.v1`. Absent on pre-AP-05 BDC reports. */
  methodVersion?: string
  unit: MetricUnit
  quality: MetricQuality
  reasons: MetricUnavailableReason[]
  degrees: MetricStats | null
  /** Cycles that actually produced a usable sample for this method. */
  usableCycles: number
}

export type MetricsCycle = {
  index: number
  startIndex: number
  endIndex: number
  startMs: number
  endMs: number
  valid: boolean
  reasons: MetricUnavailableReason[]
}

/**
 * Pedal-tracking quality for the series — independent of per-metric quality.
 * Ten locked revolutions with a hidden knee are tracking-ok, metric-unavailable.
 */
export type TrackingQuality = {
  quality: MetricQuality
  validRevolutions: number
  candidateCycles: number
  lostFrames: number
  reasons: MetricUnavailableReason[]
}

/**
 * One pose + pedal sample, optionally in the calibrated bike plane.
 * Metrics consume these streams — they do not run camera / pose / pedal cores.
 */
export type MetricsFrame = {
  timestampMs: number
  pose: PoseFrame | null
  pedal: PedalSample
  transform: PixelBikeTransform | null
}

export type MetricsReport = {
  validRevolutions: number
  candidateCycles: number
  frames: number
  cycles: MetricsCycle[]
  tracking: TrackingQuality
  metrics: Record<MetricId, MetricResult>
}

export const CAPTURE_STATES = ['ready', 'countdown', 'recording', 'finished', 'aborted'] as const
export type CaptureState = (typeof CAPTURE_STATES)[number]

export type MetricsPipelineOptions = {
  minVisibility: number
  minValidCycles: number
  minSamplesPerCycle: number
  minAngleSamplesPerCycle: number
  minVisibleFraction: number
  maxFrameGapMs: number
  maxFrames: number
  /**
   * Drop the leading partial revolution (recording started mid-crank).
   * A cycle opens only at/near TDC (0°) or after a TDC crossing.
   */
  discardLeadingPartial: boolean
  /** |crank − 0°| ≤ this arms the first cycle when discardLeadingPartial. */
  tdcAlignHalfDeg: number
  /** Crank angle of bottom dead centre. 0° = TDC (see pedal/geometry). */
  bdcAngleDeg: number
  /** Inclusive half-width of the BDC interpolation window, degrees. */
  bdcWindowHalfDeg: number
}
