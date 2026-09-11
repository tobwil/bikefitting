import type { PoseFrame } from '../types/landmarks.ts'

export const POSE_STALE_MS = 400
export const POSE_LOST_MS = 900
export const POSE_INIT_TIMEOUT_MS = 15_000
export const POSE_DETECT_TIMEOUT_MS = 250
export const POSE_RUNTIME_FAIL_LIMIT = 8

export type PoseFreshnessStatus = 'idle' | 'live' | 'stale' | 'lost'

export type PoseFreshness = {
  status: PoseFreshnessStatus
  ageMs: number
  lastTimestampMs: number | null
}

export function poseFreshness(lastTimestampMs: number | null, nowMs: number): PoseFreshness {
  if (lastTimestampMs === null) {
    return { status: 'idle', ageMs: Number.POSITIVE_INFINITY, lastTimestampMs: null }
  }
  const ageMs = Math.max(0, nowMs - lastTimestampMs)
  let status: PoseFreshnessStatus = 'live'
  if (ageMs >= POSE_LOST_MS) status = 'lost'
  else if (ageMs >= POSE_STALE_MS) status = 'stale'
  return { status, ageMs, lastTimestampMs }
}

export function poseIsReady(freshness: PoseFreshness, frame: PoseFrame | null): boolean {
  return freshness.status === 'live' && Boolean(frame && frame.landmarks.length > 0)
}

/** Drop worker replies from a previous stream / INIT generation. */
export function acceptSessionReply(current: number, incoming: number | undefined): boolean {
  if (incoming === undefined) return false
  return incoming === current
}
