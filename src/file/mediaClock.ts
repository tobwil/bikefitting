import type { SeekKind } from '../types/file.ts'

/** Typical 30 fps frame. Frame-step stays under this; slider jumps do not. */
export const SEEK_RESET_GAP_MS = 80

export function mediaTimestampMs(currentTimeSec: number): number {
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return 0
  return currentTimeSec * 1000
}

export function seekKind(
  prevMediaMs: number | null,
  nextMediaMs: number,
  maxGapMs = SEEK_RESET_GAP_MS,
): SeekKind {
  if (prevMediaMs === null || !Number.isFinite(nextMediaMs) || !Number.isFinite(prevMediaMs)) {
    return 'none'
  }
  const dt = nextMediaMs - prevMediaMs
  if (dt < -1) return 'backward'
  if (dt > maxGapMs) return 'forward'
  return 'none'
}

export function shouldResetOnSeek(
  prevMediaMs: number | null,
  nextMediaMs: number,
  maxGapMs = SEEK_RESET_GAP_MS,
): boolean {
  return seekKind(prevMediaMs, nextMediaMs, maxGapMs) !== 'none'
}

/** Pause / hold: same media time must not mint extra frames or cycles. */
export function isHeldFrame(prevMediaMs: number | null, nextMediaMs: number): boolean {
  if (prevMediaMs === null) return false
  return Math.abs(nextMediaMs - prevMediaMs) < 1e-6
}

export function frameStepSeconds(fps = 30): number {
  const n = Number.isFinite(fps) && fps > 0 ? fps : 30
  return 1 / n
}

export function clampMediaTimeSec(timeSec: number, durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0
  if (!Number.isFinite(timeSec)) return 0
  return Math.min(Math.max(0, timeSec), durationSec)
}
