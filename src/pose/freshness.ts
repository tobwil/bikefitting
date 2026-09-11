import type { PoseFrame } from '../types/landmarks.ts'
import type { PoseDetectResult, PoseDetectStatus } from '../types/pose-engine.ts'

export const POSE_STALE_MS = 400
export const POSE_LOST_MS = 900
export const POSE_INIT_TIMEOUT_MS = 15_000
export const POSE_DETECT_TIMEOUT_MS = 250
export const POSE_RUNTIME_FAIL_LIMIT = 8

export type PoseFreshnessStatus = 'idle' | 'live' | 'stale' | 'lost' | 'static'
export type PoseHold = 'none' | 'static'
export type PoseSourceKind = 'camera' | 'file' | 'synthetic'

export type PoseFreshness = {
  status: PoseFreshnessStatus
  ageMs: number
  lastTimestampMs: number | null
}

export type PoseFreshnessOptions = {
  /** Paused file / still image: last pose stays valid without a live clock. */
  hold?: PoseHold
}

/** Monotonic receive time. Never store media timestampMs as freshness. */
export function poseReceiveTime(nowMs = performance.now()): number {
  return nowMs
}

export function poseHoldForSource(input: {
  source: PoseSourceKind
  paused?: boolean
  staticCheck?: boolean
}): PoseHold {
  if (input.source !== 'file') return 'none'
  if (input.staticCheck || input.paused) return 'static'
  return 'none'
}

export function poseFreshness(
  lastSeenAtMs: number | null,
  nowMs: number,
  options?: PoseFreshnessOptions,
): PoseFreshness {
  if (lastSeenAtMs === null) {
    return { status: 'idle', ageMs: Number.POSITIVE_INFINITY, lastTimestampMs: null }
  }
  const ageMs = Math.max(0, nowMs - lastSeenAtMs)
  if (options?.hold === 'static') {
    return { status: 'static', ageMs, lastTimestampMs: lastSeenAtMs }
  }
  let status: PoseFreshnessStatus = 'live'
  if (ageMs >= POSE_LOST_MS) status = 'lost'
  else if (ageMs >= POSE_STALE_MS) status = 'stale'
  return { status, ageMs, lastTimestampMs: lastSeenAtMs }
}

export function poseIsReady(freshness: PoseFreshness, frame: PoseFrame | null): boolean {
  return (
    (freshness.status === 'live' || freshness.status === 'static') &&
    Boolean(frame && frame.landmarks.length > 0)
  )
}

/** Drop worker replies from a previous stream / INIT generation. */
export function acceptSessionReply(current: number, incoming: number | undefined): boolean {
  if (incoming === undefined) return false
  return incoming === current
}

/**
 * MISS / not_ready / dropped only update person visibility.
 * Consecutive detect timeouts mark a stuck worker.
 */
export function applyDetectToRuntimeFails(fails: number, status: PoseDetectStatus): number {
  if (status === 'frame') return 0
  if (status === 'timeout') return fails + 1
  return fails
}

export function isDetectTimeout(result: PoseDetectResult): boolean {
  return result.status === 'timeout'
}

export function shouldMarkWorkerTimeout(fails: number): boolean {
  return fails >= POSE_RUNTIME_FAIL_LIMIT
}
