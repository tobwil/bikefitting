import { iqr, mean, median, minMax, quantile } from '../metrics/stats.ts'
import type { MarkerlessCycle, MarkerlessKneeMetric, MarkerlessReason } from '../types/analysis.ts'
import { MARKERLESS_KNEE_METHOD, MARKERLESS_KNEE_METHOD_VERSION } from '../types/analysis.ts'
import type { MarkerlessOptions } from './constants.ts'
import type { MarkerlessSample } from './samples.ts'

function unique(reasons: readonly MarkerlessReason[]): MarkerlessReason[] {
  return [...new Set(reasons)]
}

function emptyKnee(reasons: MarkerlessReason[], side: MarkerlessKneeMetric['side']): MarkerlessKneeMetric {
  return {
    id: 'kneeFlexion',
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
    unit: 'deg',
    quality: 'unavailable',
    reasons: unique(reasons),
    degrees: null,
    usableCycles: 0,
    side,
    phaseSource: 'unavailable',
  }
}

function extensionCoverageOk(
  samples: readonly MarkerlessSample[],
  cycle: MarkerlessCycle,
  minIndex: number,
  options: MarkerlessOptions,
): boolean {
  const duration = cycle.endMs - cycle.startMs
  const half = Math.max(duration * options.extensionWindowFraction, options.maxFrameGapMs / 2)
  const t0 = samples[minIndex]!.mediaTimeMs - half
  const t1 = samples[minIndex]!.mediaTimeMs + half
  let n = 0
  let prevMs: number | null = null
  for (let i = cycle.startIndex; i <= cycle.endIndex; i += 1) {
    const sample = samples[i]!
    if (sample.mediaTimeMs < t0 || sample.mediaTimeMs > t1) continue
    if (sample.flexionDeg == null) continue
    if (prevMs != null && sample.mediaTimeMs - prevMs > options.maxFrameGapMs) return false
    prevMs = sample.mediaTimeMs
    n += 1
  }
  return n >= options.minExtensionSamples
}

/**
 * Per valid motion cycle: 10th percentile of valid *raw* knee flexions.
 * Smoothing is not used here. Gaps near the extension region exclude the cycle.
 * Aggregate: median of per-cycle p10 values. This is not an exact single-frame minimum
 * and not bottom dead centre.
 */
export function measureMaxExtension(
  samples: readonly MarkerlessSample[],
  cycles: MarkerlessCycle[],
  options: MarkerlessOptions,
  side: MarkerlessKneeMetric['side'],
): { cycles: MarkerlessCycle[]; knee: MarkerlessKneeMetric; usable: number[] } {
  const measured: MarkerlessCycle[] = cycles.map((cycle) => {
    if (!cycle.valid) return cycle
    const values: number[] = []
    const times: number[] = []
    const indices: number[] = []
    let prevFlex: number | null = null
    let jump = false
    for (let i = cycle.startIndex; i <= cycle.endIndex; i += 1) {
      const sample = samples[i]!
      const deg = sample.flexionDeg
      if (deg == null || !Number.isFinite(deg)) continue
      if (prevFlex != null && Math.abs(deg - prevFlex) > options.maxFlexionJumpDeg) {
        jump = true
        prevFlex = deg
        continue
      }
      prevFlex = deg
      values.push(deg)
      times.push(sample.mediaTimeMs)
      indices.push(i)
    }
    const nFrames = cycle.endIndex - cycle.startIndex + 1
    const reasons: MarkerlessReason[] = []
    if (jump) reasons.push('unrealistic_jump')
    if (values.length < options.minAngleSamplesPerCycle) reasons.push('missing_knee')
    if (values.length / nFrames < options.minVisibleFraction) reasons.push('visibility')
    if (values.length === 0) {
      return { ...cycle, valid: false, reasons: unique([...cycle.reasons, ...reasons, 'missing_knee']) }
    }
    let minVal = values[0]!
    let minAt = 0
    for (let i = 1; i < values.length; i += 1) {
      if (values[i]! < minVal) {
        minVal = values[i]!
        minAt = i
      }
    }
    const extIndex = indices[minAt]!
    if (!extensionCoverageOk(samples, cycle, extIndex, options)) {
      reasons.push('insufficient_extension_coverage')
    }
    if (reasons.length > 0) {
      return {
        ...cycle,
        valid: false,
        reasons: unique([...cycle.reasons, ...reasons]),
        rawMinFlexionDeg: minVal,
        extensionFrameIndex: extIndex,
        extensionMediaTimeMs: times[minAt]!,
      }
    }
    const p10 = quantile(values, options.p10Quantile)
    return {
      ...cycle,
      valid: true,
      reasons: [],
      p10FlexionDeg: p10,
      rawMinFlexionDeg: minVal,
      extensionFrameIndex: extIndex,
      extensionMediaTimeMs: times[minAt]!,
    }
  })

  const usable = measured
    .filter((cycle) => cycle.valid && cycle.p10FlexionDeg != null)
    .map((cycle) => cycle.p10FlexionDeg!)

  if (usable.length < options.minValidCycles) {
    const reasons: MarkerlessReason[] = ['too_few_cycles']
    if (samples.every((s) => s.flexionDeg == null)) reasons.unshift('missing_knee')
    const anyKnee = samples.some((s) => s.flexionDeg != null)
    if (!anyKnee) reasons.push('missing_knee')
    for (const cycle of measured) {
      for (const reason of cycle.reasons) reasons.push(reason)
    }
    return { cycles: measured, knee: emptyKnee(reasons, side), usable }
  }

  const { min, max } = minMax(usable)
  return {
    cycles: measured,
    usable,
    knee: {
      id: 'kneeFlexion',
      method: MARKERLESS_KNEE_METHOD,
      methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
      unit: 'deg',
      quality: 'ok',
      reasons: [],
      degrees: {
        mean: mean(usable),
        median: median(usable),
        spread: iqr(usable),
        min,
        max,
        n: usable.length,
      },
      usableCycles: usable.length,
      side,
      phaseSource: 'motion_estimate',
    },
  }
}
