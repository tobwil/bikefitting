import type { CapturePhase } from '../types/capture.ts'
import { COMPLETE_DURATION_RATIO, MIN_DECODED_DURATION_MS } from './constants.ts'

const ALLOWED: Record<CapturePhase, ReadonlySet<CapturePhase>> = {
  idle: new Set(['preparing', 'countdown', 'failed']),
  preparing: new Set(['countdown', 'idle', 'failed', 'cancelled']),
  countdown: new Set(['recording', 'cancelled', 'failed', 'idle']),
  recording: new Set(['finalizing', 'cancelled', 'failed']),
  finalizing: new Set(['saved', 'failed', 'cancelled']),
  saved: new Set(['idle', 'preparing']),
  cancelled: new Set(['idle', 'preparing']),
  failed: new Set(['idle', 'preparing']),
}

export function canTransition(from: CapturePhase, to: CapturePhase): boolean {
  return ALLOWED[from].has(to)
}

export function transitionCapture(from: CapturePhase, to: CapturePhase): CapturePhase {
  if (from === to) return from
  if (!canTransition(from, to)) return from
  return to
}

/** Remaining time; 0 means the segment elapsed. */
export function remainingMs(startedAtMs: number, durationMs: number, nowMs: number): number {
  return Math.max(0, durationMs - (nowMs - startedAtMs))
}

export function classifyClipCompleteness(input: {
  durationMs: number
  intendedDurationMs: number
}): 'complete' | 'incomplete' | 'unusable' {
  if (!Number.isFinite(input.durationMs) || input.durationMs < MIN_DECODED_DURATION_MS) {
    return 'unusable'
  }
  if (input.intendedDurationMs <= 0) return 'complete'
  const needed = Math.max(MIN_DECODED_DURATION_MS, input.intendedDurationMs * COMPLETE_DURATION_RATIO)
  return input.durationMs + 1 >= needed ? 'complete' : 'incomplete'
}

export type CaptureClockSnapshot = {
  phase: CapturePhase
  countdownRemainingMs: number
  recordRemainingMs: number
}

export function tickCaptureClock(input: {
  phase: CapturePhase
  countdownStartedAtMs: number | null
  countdownMs: number
  recordStartedAtMs: number | null
  recordMs: number
  nowMs: number
}): CaptureClockSnapshot & { elapsed: boolean } {
  if (input.phase === 'countdown' && input.countdownStartedAtMs != null) {
    const left = remainingMs(input.countdownStartedAtMs, input.countdownMs, input.nowMs)
    return {
      phase: left <= 0 ? 'recording' : 'countdown',
      countdownRemainingMs: left,
      recordRemainingMs: input.recordMs,
      elapsed: left <= 0,
    }
  }
  if (input.phase === 'recording' && input.recordStartedAtMs != null) {
    const left = remainingMs(input.recordStartedAtMs, input.recordMs, input.nowMs)
    return {
      phase: 'recording',
      countdownRemainingMs: 0,
      recordRemainingMs: left,
      elapsed: left <= 0,
    }
  }
  return {
    phase: input.phase,
    countdownRemainingMs: input.phase === 'countdown' ? input.countdownMs : 0,
    recordRemainingMs: input.phase === 'recording' ? input.recordMs : 0,
    elapsed: false,
  }
}
