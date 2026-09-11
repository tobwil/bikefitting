import type { SeekKind } from '../types/file.ts'
import { seekKind, SEEK_RESET_GAP_MS } from './mediaClock.ts'

export type TimeDependentSinks = {
  resetPedalTemporal: () => void
  resetMetrics: () => void
  resetCaptureAggregators: () => void
  bumpPoseSession?: () => void
  resetOverlayFilter?: () => void
}

/**
 * Seek (forward jump or any rewind) must drop time-dependent tracker /
 * aggregator state so a scrub cannot mint fake crank cycles.
 */
export function applySeekReset(
  sinks: TimeDependentSinks,
  prevMediaMs: number | null,
  nextMediaMs: number,
  maxGapMs = SEEK_RESET_GAP_MS,
): SeekKind {
  const kind = seekKind(prevMediaMs, nextMediaMs, maxGapMs)
  if (kind === 'none') return 'none'
  sinks.resetPedalTemporal()
  sinks.resetMetrics()
  sinks.resetCaptureAggregators()
  sinks.bumpPoseSession?.()
  sinks.resetOverlayFilter?.()
  return kind
}

export function emptySeekSinks(): TimeDependentSinks {
  return {
    resetPedalTemporal() {},
    resetMetrics() {},
    resetCaptureAggregators() {},
  }
}
