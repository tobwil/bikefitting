import type { MarkerlessCycle, MarkerlessReason, MarkerlessSegment } from '../types/analysis.ts'
import { cycleMsBounds, type MarkerlessOptions } from './constants.ts'
import type { MarkerlessSample } from './samples.ts'

export type MotionSegmentation = {
  selected: MarkerlessSegment | null
  excluded: MarkerlessSegment[]
  cycles: MarkerlessCycle[]
}

type Label = MarkerlessSegment['reason']

function dtSec(prevMs: number, nextMs: number): number {
  return Math.max((nextMs - prevMs) / 1000, 1e-6)
}

/** Ankle height relative to hip in image space (positive = ankle lower). */
function relativeAnkleY(sample: MarkerlessSample): number | null {
  if (!sample.accepted || sample.hip == null || sample.ankle == null) return null
  return sample.ankle.y - sample.hip.y
}

function smooth(values: readonly (number | null)[], radius = 2): Array<number | null> {
  const out: Array<number | null> = []
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] == null) {
      out.push(null)
      continue
    }
    let sum = 0
    let n = 0
    for (let j = i - radius; j <= i + radius; j += 1) {
      const v = values[j]
      if (v == null) continue
      sum += v
      n += 1
    }
    out.push(n > 0 ? sum / n : values[i]!)
  }
  return out
}

function rollingAmplitude(
  signal: readonly (number | null)[],
  times: readonly number[],
  index: number,
  windowMs: number,
): number {
  const t = times[index]!
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < signal.length; i += 1) {
    const v = signal[i]
    if (v == null) continue
    if (Math.abs(times[i]! - t) > windowMs / 2) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0
  return max - min
}

function labelSample(
  samples: readonly MarkerlessSample[],
  signal: readonly (number | null)[],
  i: number,
  options: MarkerlessOptions,
): Label {
  const sample = samples[i]!
  if (relativeAnkleY(sample) == null) return 'gap'
  if (i > 0) {
    const prev = samples[i - 1]!
    if (prev.hip && sample.hip) {
      const dt = dtSec(prev.mediaTimeMs, sample.mediaTimeMs)
      if (sample.mediaTimeMs - prev.mediaTimeMs > options.maxFrameGapMs) return 'gap'
      const hipSpeed = Math.hypot(sample.hip.x - prev.hip.x, sample.hip.y - prev.hip.y) / dt
      if (hipSpeed > options.hipMaxSpeedPerSec) return 'mount_dismount'
    }
  }
  const times = samples.map((item) => item.mediaTimeMs)
  const amp = rollingAmplitude(signal, times, i, cycleMsBounds(options).maxMs)
  if (amp < options.minRadiusAmplitude) return 'still'
  return 'pedaling'
}

function closeSegment(
  reason: Label,
  startIndex: number,
  endIndex: number,
  samples: readonly MarkerlessSample[],
): MarkerlessSegment {
  return {
    reason,
    startIndex,
    endIndex,
    startMs: samples[startIndex]!.mediaTimeMs,
    endMs: samples[endIndex]!.mediaTimeMs,
  }
}

function segmentsOf(
  samples: readonly MarkerlessSample[],
  labels: readonly Label[],
): MarkerlessSegment[] {
  const segments: MarkerlessSegment[] = []
  if (samples.length === 0) return segments
  let start = 0
  let current = labels[0]!
  for (let i = 1; i <= labels.length; i += 1) {
    if (i === labels.length || labels[i] !== current) {
      segments.push(closeSegment(current, start, i - 1, samples))
      if (i < labels.length) {
        start = i
        current = labels[i]!
      }
    }
  }
  return segments
}

/**
 * Local maxima of the search-smoothed relative-ankle signal.
 * Used only to find period — numeric knee values stay raw.
 */
function peakIndices(
  smoothed: readonly (number | null)[],
  times: readonly number[],
  options: MarkerlessOptions,
): number[] {
  const { minMs, maxMs } = cycleMsBounds(options)
  const raw: number[] = []
  for (let i = 1; i < smoothed.length - 1; i += 1) {
    const v = smoothed[i]
    const prev = smoothed[i - 1]
    const next = smoothed[i + 1]
    if (v == null || prev == null || next == null) continue
    if (v >= prev && v > next) raw.push(i)
  }
  const peaks: number[] = []
  for (const i of raw) {
    const last = peaks[peaks.length - 1]
    if (last == null) {
      peaks.push(i)
      continue
    }
    const dt = times[i]! - times[last]!
    if (dt < minMs * 0.6) {
      const lastV = smoothed[last]
      const thisV = smoothed[i]
      if (lastV != null && thisV != null && thisV > lastV) peaks[peaks.length - 1] = i
      continue
    }
    if (dt > maxMs * 1.25) {
      peaks.push(i)
      continue
    }
    peaks.push(i)
  }
  return peaks
}

function cycleReasons(
  samples: readonly MarkerlessSample[],
  startIndex: number,
  endIndex: number,
  options: MarkerlessOptions,
  extra: MarkerlessReason[] = [],
): MarkerlessReason[] {
  const reasons: MarkerlessReason[] = [...extra]
  const n = endIndex - startIndex + 1
  if (n < options.minSamplesPerCycle) reasons.push('too_few_cycles')
  const { minMs, maxMs } = cycleMsBounds(options)
  const duration = samples[endIndex]!.mediaTimeMs - samples[startIndex]!.mediaTimeMs
  if (duration < minMs || duration > maxMs) reasons.push('not_pedaling')
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    const gap = samples[i]!.mediaTimeMs - samples[i - 1]!.mediaTimeMs
    if (gap > options.maxFrameGapMs) {
      reasons.push('too_few_cycles')
      break
    }
  }
  const ys: number[] = []
  for (let i = startIndex; i <= endIndex; i += 1) {
    const y = relativeAnkleY(samples[i]!)
    if (y != null) ys.push(y)
  }
  if (ys.length >= 2) {
    const amp = Math.max(...ys) - Math.min(...ys)
    if (amp < options.minRadiusAmplitude) reasons.push('still')
  }
  return [...new Set(reasons)]
}

/**
 * Pick the longest contiguous pedaling island and split it into full
 * ankle-vs-hip periods. Mount/dismount/still are excluded, not stitched.
 */
export function detectMotionCycles(
  samples: readonly MarkerlessSample[],
  options: MarkerlessOptions,
  sideSwitch = false,
): MotionSegmentation {
  if (samples.length === 0) {
    return { selected: null, excluded: [], cycles: [] }
  }

  const rawSignal = samples.map(relativeAnkleY)
  const searchSignal = smooth(rawSignal)
  const labels = samples.map((_, i) => labelSample(samples, rawSignal, i, options))
  const segments = segmentsOf(samples, labels)
  const pedaling = segments.filter((seg) => seg.reason === 'pedaling')
  const excluded = segments.filter((seg) => seg.reason !== 'pedaling')
  const selected =
    pedaling.length === 0
      ? null
      : pedaling.reduce((best, seg) =>
          seg.endIndex - seg.startIndex > best.endIndex - best.startIndex ? seg : best,
        )

  if (!selected) {
    return { selected: null, excluded, cycles: [] }
  }

  const times = samples.map((item) => item.mediaTimeMs)
  const peaks = peakIndices(searchSignal, times, options).filter(
    (index) => index >= selected.startIndex && index <= selected.endIndex,
  )
  const extra: MarkerlessReason[] = sideSwitch ? ['side_switch'] : []
  const cycles: MarkerlessCycle[] = []
  for (let p = 0; p < peaks.length - 1; p += 1) {
    const startIndex = peaks[p]!
    const endIndex = peaks[p + 1]!
    const reasons = cycleReasons(samples, startIndex, endIndex, options, extra)
    cycles.push({
      index: cycles.length,
      startIndex,
      endIndex,
      startMs: samples[startIndex]!.mediaTimeMs,
      endMs: samples[endIndex]!.mediaTimeMs,
      valid: reasons.length === 0,
      reasons,
      p10FlexionDeg: null,
      rawMinFlexionDeg: null,
      extensionFrameIndex: null,
      extensionMediaTimeMs: null,
    })
  }

  return { selected, excluded, cycles }
}
