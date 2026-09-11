import { unwrapDeltaDeg } from '../pedal/geometry.ts'
import type { MetricsCycle, MetricsFrame, MetricsPipelineOptions } from '../types/metrics.ts'
import type { PedalSample } from '../types/pedal.ts'

export function pedalAngleDeg(sample: PedalSample): number | null {
  if (sample.crankAngleDeg !== null && Number.isFinite(sample.crankAngleDeg)) {
    return sample.crankAngleDeg
  }
  if (sample.phase01 !== null && Number.isFinite(sample.phase01)) {
    const phase = ((sample.phase01 % 1) + 1) % 1
    return phase * 360
  }
  return null
}

/** Locked samples with a finite crank angle / phase. Idle/seeding do not start a cycle. */
export function pedalCanTrack(sample: PedalSample): boolean {
  return sample.status === 'locked' && pedalAngleDeg(sample) !== null
}

export function nearTdc(angleDeg: number, halfDeg: number): boolean {
  const wrapped = ((angleDeg % 360) + 360) % 360
  return Math.min(wrapped, 360 - wrapped) <= halfDeg
}

/** Forward wrap across 0° (TDC). */
export function crossedTdc(prevDeg: number, nextDeg: number): boolean {
  return prevDeg > 270 && nextDeg < 90
}

function evaluateCycle(
  frames: readonly MetricsFrame[],
  startIndex: number,
  endIndex: number,
  index: number,
  options: Pick<MetricsPipelineOptions, 'minSamplesPerCycle' | 'maxFrameGapMs'>,
): MetricsCycle {
  const reasons: MetricsCycle['reasons'] = []
  const n = endIndex - startIndex + 1
  if (n < options.minSamplesPerCycle) reasons.push('phase_loss')
  for (let i = startIndex + 1; i <= endIndex; i += 1) {
    const gap = frames[i]!.timestampMs - frames[i - 1]!.timestampMs
    if (gap > options.maxFrameGapMs) {
      reasons.push('phase_loss')
      break
    }
  }
  const unique = [...new Set(reasons)]
  return {
    index,
    startIndex,
    endIndex,
    startMs: frames[startIndex]!.timestampMs,
    endMs: frames[endIndex]!.timestampMs,
    valid: unique.length === 0,
    reasons: unique,
  }
}

/**
 * Split a pedal-phase stream into crank revolutions.
 *
 * A candidate cycle is a continuous locked unwrap of ≥360° starting at/near
 * TDC (0°) when `discardLeadingPartial` is set (default). The incomplete
 * segment from mid-crank recording start to the first TDC is dropped — it
 * is not counted as a full revolution.
 *
 * Incomplete segments (lock lost, idle, trailing partial rev) are excluded.
 */
export function detectCycles(
  frames: readonly MetricsFrame[],
  options: Pick<
    MetricsPipelineOptions,
    'minSamplesPerCycle' | 'maxFrameGapMs' | 'discardLeadingPartial' | 'tdcAlignHalfDeg'
  >,
): MetricsCycle[] {
  const discardLeading = options.discardLeadingPartial !== false
  const tdcHalf = options.tdcAlignHalfDeg ?? 15
  const cycles: MetricsCycle[] = []
  let openStart = -1
  let openStartUnwrapped = 0
  let unwrapped = 0
  let prevAngle: number | null = null
  let armed = !discardLeading

  const closeIncomplete = () => {
    openStart = -1
    prevAngle = null
    if (discardLeading) armed = false
  }

  const armAt = (index: number, wrap: number) => {
    armed = true
    openStart = index
    openStartUnwrapped = wrap
  }

  for (let i = 0; i < frames.length; i += 1) {
    const sample = frames[i]!.pedal
    // `lost` / idle / seeding end a revolution. A locked frame with no
    // angle is a brief miss (tracker still locked) — skip, do not discard.
    if (sample.status !== 'locked') {
      closeIncomplete()
      continue
    }
    const angle = pedalAngleDeg(sample)
    if (angle === null) continue
    if (prevAngle === null) {
      unwrapped = angle
      prevAngle = angle
      if (!discardLeading || nearTdc(angle, tdcHalf)) {
        armAt(i, unwrapped)
      }
      continue
    }

    const wrappedThroughTdc = crossedTdc(prevAngle, angle)
    unwrapped += unwrapDeltaDeg(prevAngle, angle)
    prevAngle = angle

    if (!armed) {
      if (wrappedThroughTdc || nearTdc(angle, tdcHalf)) {
        armAt(i, unwrapped)
      }
      continue
    }

    if (openStart < 0) {
      armAt(i, unwrapped)
      continue
    }

    if (Math.abs(unwrapped - openStartUnwrapped) >= 360) {
      cycles.push(evaluateCycle(frames, openStart, i, cycles.length, options))
      openStart = i
      openStartUnwrapped = unwrapped
    }
  }

  return cycles
}
