import type { PixelBikeTransform } from './calibration.ts'
import type { PoseFrame } from './landmarks.ts'
import type { PedalSample } from './pedal.ts'

export const METRIC_IDS = ['kneeFlexion', 'trunkTorso', 'elbow'] as const
export type MetricId = (typeof METRIC_IDS)[number]

/**
 * Machine-readable why a metric is `unavailable`.
 * Not a quality score and not Ampel — either the number exists or it does not.
 */
export type MetricUnavailableReason =
  | 'visibility'
  | 'phase_loss'
  | 'too_few_cycles'

export type MetricQuality = 'ok' | 'unavailable'

/** Mean / median / IQR of per-cycle means. Degrees. No Ampel band. */
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
  quality: MetricQuality
  reasons: MetricUnavailableReason[]
  degrees: MetricStats | null
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
  metrics: Record<MetricId, MetricResult>
}

export type MetricsPipelineOptions = {
  minVisibility: number
  minValidCycles: number
  minSamplesPerCycle: number
  minAngleSamplesPerCycle: number
  minVisibleFraction: number
  maxFrameGapMs: number
  maxFrames: number
}
