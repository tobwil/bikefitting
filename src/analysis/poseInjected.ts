import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import type { Landmark, PoseFrame } from '../types/landmarks.ts'
import type { PoseDetectResult } from '../types/pose-engine.ts'
import type { PoseSource } from './run.ts'

export type ClipMotionKind = 'stillstand' | 'mount' | 'pedaling' | 'dismount'

export type ClipTimelineSpan = {
  startMs: number
  endMs: number
  kind: ClipMotionKind
}

/** 8 s clip: still, mount, pedaling, dismount, still. */
export const HARNESS_CLIP_TIMELINE: ClipTimelineSpan[] = [
  { startMs: 0, endMs: 1200, kind: 'stillstand' },
  { startMs: 1200, endMs: 2200, kind: 'mount' },
  { startMs: 2200, endMs: 6200, kind: 'pedaling' },
  { startMs: 6200, endMs: 7200, kind: 'dismount' },
  { startMs: 7200, endMs: 8000, kind: 'stillstand' },
]

export const HARNESS_CLIP_DURATION_MS = 8000

function kindAt(timeMs: number, timeline: readonly ClipTimelineSpan[]): ClipMotionKind {
  for (const span of timeline) {
    if (timeMs >= span.startMs && timeMs < span.endMs) return span.kind
  }
  return timeline[timeline.length - 1]?.kind ?? 'stillstand'
}

function shiftAnkle(pose: PoseFrame, dy: number): PoseFrame {
  const landmarks: Landmark[] = pose.landmarks.map((lm, index) => {
    if (index === 28 || index === 30 || index === 32 || index === 27 || index === 29 || index === 31) {
      return { ...lm, y: lm.y + dy }
    }
    return { ...lm }
  })
  return { ...pose, landmarks }
}

export function poseForTimeline(
  mediaTimeMs: number,
  timeline: readonly ClipTimelineSpan[] = HARNESS_CLIP_TIMELINE,
): PoseFrame {
  const kind = kindAt(mediaTimeMs, timeline)
  if (kind === 'pedaling') return syntheticPoseFrame(mediaTimeMs)
  if (kind === 'stillstand') return syntheticPoseFrame(0)
  const span = timeline.find((row) => row.kind === kind && mediaTimeMs >= row.startMs && mediaTimeMs < row.endMs)
  const local = span ? (mediaTimeMs - span.startMs) / Math.max(1, span.endMs - span.startMs) : 0
  const frozen = syntheticPoseFrame(0)
  if (kind === 'mount') return shiftAnkle(frozen, 0.14 * local)
  return shiftAnkle(frozen, 0.14 * (1 - local))
}

export function createTimelinePoseSource(
  timeline: readonly ClipTimelineSpan[] = HARNESS_CLIP_TIMELINE,
): PoseSource {
  return {
    async detect(frame, inferenceTimestampMs, token) {
      if (!token.isCurrent()) return { status: 'dropped' }
      const pose = poseForTimeline(frame.mediaTimeMs, timeline)
      return {
        status: 'frame',
        frame: { ...pose, timestampMs: inferenceTimestampMs },
      }
    },
  }
}

export function createFailingPoseSource(afterFrames = 0): PoseSource {
  let seen = 0
  return {
    async detect(_frame, _ts, token) {
      if (!token.isCurrent()) return { status: 'dropped' }
      seen += 1
      if (seen > afterFrames) return { status: 'error', message: 'injected pose failure' }
      return { status: 'miss' }
    },
  }
}

export function createDelayedPoseSource(delayMs: number, inner: PoseSource): PoseSource {
  return {
    async detect(frame, inferenceTimestampMs, token) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (!token.isCurrent()) return { status: 'dropped' }
      return inner.detect(frame, inferenceTimestampMs, token)
    },
  }
}

export function resultFromDetect(result: PoseDetectResult): string {
  return result.status
}
