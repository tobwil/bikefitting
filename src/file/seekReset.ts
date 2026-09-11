import type { SeekKind } from '../types/file.ts'
import {
  classifyTimelineDiscontinuity,
  seekKind,
  SEEK_RESET_GAP_MS,
  type TimelineSource,
} from './mediaClock.ts'

export type TimeDependentSinks = {
  resetPedalTemporal: () => void
  resetMetrics: () => void
  resetCaptureAggregators: () => void
  bumpPoseSession?: () => void
  resetOverlayFilter?: () => void
  resetPose?: () => void
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
  sinks.resetPose?.()
  return kind
}

/**
 * FitSession wiring: only a real file transport seek resets aggregators.
 * Camera 10fps / inference holes and dropped file frames stay on the timeline.
 */
export function applyFileTransportSeek(
  source: TimelineSource,
  info: { prevMediaMs: number; nextMediaMs: number; transportSeek: boolean },
  sinks: TimeDependentSinks,
  maxGapMs = SEEK_RESET_GAP_MS,
): SeekKind {
  const kind = classifyTimelineDiscontinuity({
    source,
    prevMediaMs: info.prevMediaMs,
    nextMediaMs: info.nextMediaMs,
    transportSeek: info.transportSeek,
    maxGapMs,
  })
  if (kind !== 'seek') return 'none'
  return applySeekReset(sinks, info.prevMediaMs, info.nextMediaMs, maxGapMs)
}

export function emptySeekSinks(): TimeDependentSinks {
  return {
    resetPedalTemporal() {},
    resetMetrics() {},
    resetCaptureAggregators() {},
  }
}
