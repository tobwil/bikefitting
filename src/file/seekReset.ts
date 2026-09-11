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
  /**
   * Shared capture/segment reset — metrics aggregator, phase evidence,
   * foot samples, and media range. Seek must not leave stale stills or
   * timestamps in a later result.
   */
  resetCaptureAggregators: () => void
  bumpPoseSession?: () => void
  resetOverlayFilter?: () => void
  resetPose?: () => void
  resetMeasureSideLock?: () => void
}

/**
 * All recording-time consumers that share one segment identity.
 * Seek either aborts the take or opens a new segment (unique id) via
 * `openNewSegment` — never keep frames A in a result that continues with B.
 */
export type CaptureSegmentSinks = {
  resetMetricsAggregator: () => void
  resetPhaseCapture: () => void
  clearPhaseEvidence: () => void
  resetFoot: () => void
  resetMediaRange: () => void
  resetMeasureSideLock?: () => void
}

export function resetCaptureSegment(sinks: CaptureSegmentSinks): void {
  sinks.resetMetricsAggregator()
  sinks.resetPhaseCapture()
  sinks.clearPhaseEvidence()
  sinks.resetFoot()
  sinks.resetMediaRange()
  sinks.resetMeasureSideLock?.()
}

/**
 * Seek (forward jump or any rewind) must drop time-dependent tracker /
 * aggregator state so a scrub cannot mint fake crank cycles or keep
 * pre-seek phase / foot / media evidence.
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
  sinks.resetMeasureSideLock?.()
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
