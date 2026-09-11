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
 * A candidate cycle is a continuous locked unwrap of ≥360° (phase 0→1 wrap).
 * Incomplete segments (lock lost, idle, trailing partial rev) are excluded,
 * not counted as valid revolutions.
 */
export function detectCycles(
  frames: readonly MetricsFrame[],
  options: Pick<MetricsPipelineOptions, 'minSamplesPerCycle' | 'maxFrameGapMs'>,
): MetricsCycle[] {
  const cycles: MetricsCycle[] = []
  let openStart = -1
  let openStartUnwrapped = 0
  let unwrapped = 0
  let prevAngle: number | null = null

  const closeIncomplete = () => {
    openStart = -1
    prevAngle = null
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
      if (openStart < 0) {
        openStart = i
        openStartUnwrapped = unwrapped
      }
      continue
    }

    unwrapped += unwrapDeltaDeg(prevAngle, angle)
    prevAngle = angle
    if (openStart < 0) {
      openStart = i
      openStartUnwrapped = unwrapped
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
