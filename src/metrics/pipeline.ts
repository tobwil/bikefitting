import type {
  MetricId,
  MetricResult,
  MetricStats,
  MetricUnavailableReason,
  MetricsFrame,
  MetricsPipelineOptions,
  MetricsReport,
  TrackingQuality,
} from '../types/metrics.ts'
import { METRIC_IDS, METRIC_METHOD_BY_ID } from '../types/metrics.ts'
import { sampleMetricDegrees, sagittalJoints } from './angles.ts'
import { BDC_ANGLE_DEG, BDC_WINDOW_HALF_DEG, estimateAtBdc, type BdcSample } from './bdc.ts'
import { detectCycles, pedalAngleDeg } from './cycles.ts'
import { iqr, mean, median, minMax } from './stats.ts'

export const DEFAULT_METRICS_OPTIONS: MetricsPipelineOptions = {
  minVisibility: 0.75,
  minValidCycles: 3,
  minSamplesPerCycle: 8,
  minAngleSamplesPerCycle: 4,
  minVisibleFraction: 0.5,
  maxFrameGapMs: 400,
  maxFrames: 900,
  discardLeadingPartial: true,
  tdcAlignHalfDeg: 15,
  bdcAngleDeg: BDC_ANGLE_DEG,
  bdcWindowHalfDeg: BDC_WINDOW_HALF_DEG,
}

export type MetricsPipeline = {
  push(frame: MetricsFrame): void
  reset(): void
  snapshot(): MetricsReport
}

function unavailable(
  id: MetricId,
  reasons: MetricUnavailableReason[],
  usableCycles = 0,
): MetricResult {
  return {
    id,
    method: METRIC_METHOD_BY_ID[id],
    unit: 'deg',
    quality: 'unavailable',
    reasons,
    degrees: null,
    usableCycles,
  }
}

function okResult(id: MetricId, values: readonly number[]): MetricResult {
  return {
    id,
    method: METRIC_METHOD_BY_ID[id],
    unit: 'deg',
    quality: 'ok',
    reasons: [],
    degrees: statsOf(values),
    usableCycles: values.length,
  }
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

function emptyTracking(): TrackingQuality {
  return {
    quality: 'unavailable',
    validRevolutions: 0,
    candidateCycles: 0,
    lostFrames: 0,
    reasons: ['too_few_cycles'],
  }
}

export function emptyMetricsReport(): MetricsReport {
  return {
    validRevolutions: 0,
    candidateCycles: 0,
    frames: 0,
    cycles: [],
    tracking: emptyTracking(),
    metrics: {
      kneeFlexion: unavailable('kneeFlexion', ['too_few_cycles']),
      kneeFlexionCycleMean: unavailable('kneeFlexionCycleMean', ['too_few_cycles']),
      trunkTorso: unavailable('trunkTorso', ['too_few_cycles']),
      elbow: unavailable('elbow', ['too_few_cycles']),
    },
  }
}

function sampleId(id: MetricId): 'kneeFlexion' | 'trunkTorso' | 'elbow' {
  if (id === 'kneeFlexionCycleMean' || id === 'kneeFlexion') return 'kneeFlexion'
  return id
}

function cycleMean(
  frames: readonly MetricsFrame[],
  startIndex: number,
  endIndex: number,
  id: MetricId,
  options: MetricsPipelineOptions,
): { value: number | null; hadVisible: boolean } {
  const nFrames = endIndex - startIndex + 1
  const samples: number[] = []
  let hadVisible = false
  for (let i = startIndex; i <= endIndex; i += 1) {
    const joints = sagittalJoints(frames[i]!, options.minVisibility)
    if (!joints) continue
    const deg = sampleMetricDegrees(joints, sampleId(id))
    if (deg !== null && Number.isFinite(deg)) {
      hadVisible = true
      samples.push(deg)
    }
  }
  if (samples.length < options.minAngleSamplesPerCycle) return { value: null, hadVisible }
  if (samples.length / nFrames < options.minVisibleFraction) return { value: null, hadVisible }
  return { value: mean(samples), hadVisible }
}

function cycleBdc(
  frames: readonly MetricsFrame[],
  startIndex: number,
  endIndex: number,
  options: MetricsPipelineOptions,
): { value: number | null; hadVisible: boolean; hadWindow: boolean } {
  const samples: BdcSample[] = []
  let hadVisible = false
  for (let i = startIndex; i <= endIndex; i += 1) {
    const angle = pedalAngleDeg(frames[i]!.pedal)
    if (angle === null) continue
    const joints = sagittalJoints(frames[i]!, options.minVisibility)
    if (!joints) continue
    const deg = sampleMetricDegrees(joints, 'kneeFlexion')
    if (deg === null || !Number.isFinite(deg)) continue
    hadVisible = true
    samples.push({ angleDeg: angle, valueDeg: deg })
  }
  const estimate = estimateAtBdc(samples, options)
  return {
    value: estimate?.valueDeg ?? null,
    hadVisible,
    hadWindow: estimate !== null,
  }
}

function reasonsForMetric(
  usable: number,
  validRevolutions: number,
  visibilityDropped: boolean,
  phaseLossSeen: boolean,
  insufficientBdc: boolean,
  minValidCycles: number,
): MetricUnavailableReason[] {
  if (usable >= minValidCycles) return []
  const reasons: MetricUnavailableReason[] = []
  if (insufficientBdc && validRevolutions > 0 && usable < minValidCycles) {
    reasons.push('insufficient_bdc')
  }
  if (usable === 0 && visibilityDropped && validRevolutions > 0 && !insufficientBdc) {
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

function trackingOf(
  frames: readonly MetricsFrame[],
  validRevolutions: number,
  candidateCycles: number,
  phaseLossSeen: boolean,
  minValidCycles: number,
): TrackingQuality {
  const lostFrames = frames.filter((frame) => frame.pedal.status === 'lost').length
  const reasons: MetricUnavailableReason[] = []
  if (validRevolutions < minValidCycles) reasons.push('too_few_cycles')
  if (phaseLossSeen && validRevolutions < minValidCycles) reasons.push('phase_loss')
  if (reasons.length === 0 && lostFrames > 0 && validRevolutions < minValidCycles) {
    reasons.push('phase_loss')
  }
  return {
    quality: validRevolutions >= minValidCycles ? 'ok' : 'unavailable',
    validRevolutions,
    candidateCycles,
    lostFrames,
    reasons: validRevolutions >= minValidCycles ? [] : reasons.length > 0 ? reasons : ['too_few_cycles'],
  }
}

/**
 * Aggregate sagittal angles over valid crank cycles.
 *
 * `kneeFlexion` is bottom-dead-centre (window + interpolation in `bdc.ts`).
 * `kneeFlexionCycleMean` is the per-cycle mean — a separate metric.
 * Each result carries method, unit, usable cycle count, and quality.
 * Tracking quality (pedal revolutions) is independent of per-metric quality.
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
    let insufficientBdc = false
    for (const cycle of valid) {
      if (id === 'kneeFlexion') {
        const sample = cycleBdc(frames, cycle.startIndex, cycle.endIndex, opts)
        if (sample.value === null) {
          if (sample.hadVisible && !sample.hadWindow) insufficientBdc = true
          else visibilityDropped = true
        } else {
          usable.push(sample.value)
        }
      } else {
        const sample = cycleMean(frames, cycle.startIndex, cycle.endIndex, id, opts)
        if (sample.value === null) visibilityDropped = true
        else usable.push(sample.value)
      }
    }
    const reasons = reasonsForMetric(
      usable.length,
      validRevolutions,
      visibilityDropped,
      phaseLossSeen,
      insufficientBdc,
      opts.minValidCycles,
    )
    metrics[id] = reasons.length === 0 ? okResult(id, usable) : unavailable(id, reasons, usable.length)
  }

  return {
    validRevolutions,
    candidateCycles: cycles.length,
    frames: frames.length,
    cycles,
    tracking: trackingOf(frames, validRevolutions, cycles.length, phaseLossSeen, opts.minValidCycles),
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
