import type {
  MetricId,
  MetricResult,
  MetricStats,
  MetricUnavailableReason,
  MetricsFrame,
  MetricsPipelineOptions,
  MetricsReport,
} from '../types/metrics.ts'
import { METRIC_IDS } from '../types/metrics.ts'
import { sampleMetricDegrees, sagittalJoints } from './angles.ts'
import { detectCycles } from './cycles.ts'
import { iqr, mean, median, minMax } from './stats.ts'

export const DEFAULT_METRICS_OPTIONS: MetricsPipelineOptions = {
  minVisibility: 0.75,
  minValidCycles: 3,
  minSamplesPerCycle: 8,
  minAngleSamplesPerCycle: 4,
  minVisibleFraction: 0.5,
  maxFrameGapMs: 400,
  maxFrames: 900,
}

export type MetricsPipeline = {
  push(frame: MetricsFrame): void
  reset(): void
  snapshot(): MetricsReport
}

function unavailable(
  id: MetricId,
  reasons: MetricUnavailableReason[],
): MetricResult {
  return { id, quality: 'unavailable', reasons, degrees: null }
}

function statsOf(values: readonly number[]): MetricStats {
  const { min, max } = minMax(values)
  return {
    mean: mean(values),
    median: median(values),
    spread: iqr(values),
    min,
    max,
    n: values.length,
  }
}

export function emptyMetricsReport(): MetricsReport {
  return {
    validRevolutions: 0,
    candidateCycles: 0,
    frames: 0,
    cycles: [],
    metrics: {
      kneeFlexion: unavailable('kneeFlexion', ['too_few_cycles']),
      trunkTorso: unavailable('trunkTorso', ['too_few_cycles']),
      elbow: unavailable('elbow', ['too_few_cycles']),
    },
  }
}

function cycleMeans(
  frames: readonly MetricsFrame[],
  startIndex: number,
  endIndex: number,
  id: MetricId,
  options: MetricsPipelineOptions,
): number | null {
  const nFrames = endIndex - startIndex + 1
  const samples: number[] = []
  for (let i = startIndex; i <= endIndex; i += 1) {
    const joints = sagittalJoints(frames[i]!, options.minVisibility)
    if (!joints) continue
    const deg = sampleMetricDegrees(joints, id)
    if (deg !== null && Number.isFinite(deg)) samples.push(deg)
  }
  if (samples.length < options.minAngleSamplesPerCycle) return null
  if (samples.length / nFrames < options.minVisibleFraction) return null
  return mean(samples)
}

function reasonsForMetric(
  usable: number,
  validRevolutions: number,
  visibilityDropped: boolean,
  phaseLossSeen: boolean,
  minValidCycles: number,
): MetricUnavailableReason[] {
  if (usable >= minValidCycles) return []
  const reasons: MetricUnavailableReason[] = []
  if (usable === 0 && visibilityDropped && validRevolutions > 0) {
    reasons.push('visibility')
    return reasons
  }
  if (validRevolutions < minValidCycles) reasons.push('too_few_cycles')
  else if (usable < minValidCycles) reasons.push('too_few_cycles')
  if (visibilityDropped) reasons.push('visibility')
  if (phaseLossSeen && validRevolutions < minValidCycles) reasons.push('phase_loss')
  if (reasons.length === 0) reasons.push('too_few_cycles')
  return [...new Set(reasons)]
}

/**
 * Aggregate sagittal angles over valid crank cycles.
 * Invalid segments (phase loss, sparse samples) are excluded.
 * Each metric is `ok` with numbers or `unavailable` with reasons — never both.
 */
export function computeMetricsReport(
  frames: readonly MetricsFrame[],
  options?: Partial<MetricsPipelineOptions>,
): MetricsReport {
  const opts = { ...DEFAULT_METRICS_OPTIONS, ...options }
  if (frames.length === 0) return emptyMetricsReport()

  const cycles = detectCycles(frames, opts)
  const valid = cycles.filter((c) => c.valid)
  const validRevolutions = valid.length
  const phaseLossSeen =
    cycles.some((c) => c.reasons.includes('phase_loss')) ||
    frames.some((f) => f.pedal.status === 'lost')

  const metrics = {} as Record<MetricId, MetricResult>
  for (const id of METRIC_IDS) {
    const usable: number[] = []
    let visibilityDropped = false
    for (const cycle of valid) {
      const value = cycleMeans(frames, cycle.startIndex, cycle.endIndex, id, opts)
      if (value === null) visibilityDropped = true
      else usable.push(value)
    }
    const reasons = reasonsForMetric(
      usable.length,
      validRevolutions,
      visibilityDropped,
      phaseLossSeen,
      opts.minValidCycles,
    )
    metrics[id] =
      reasons.length === 0
        ? { id, quality: 'ok', reasons: [], degrees: statsOf(usable) }
        : unavailable(id, reasons)
  }

  return {
    validRevolutions,
    candidateCycles: cycles.length,
    frames: frames.length,
    cycles,
    metrics,
  }
}

export function createMetricsPipeline(
  options?: Partial<MetricsPipelineOptions>,
): MetricsPipeline {
  const opts = { ...DEFAULT_METRICS_OPTIONS, ...options }
  const frames: MetricsFrame[] = []
  return {
    push(frame) {
      frames.push(frame)
      if (frames.length > opts.maxFrames) {
        frames.splice(0, frames.length - opts.maxFrames)
      }
    },
    reset() {
      frames.length = 0
    },
    snapshot() {
      return computeMetricsReport(frames, opts)
    },
  }
}
