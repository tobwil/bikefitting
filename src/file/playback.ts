import { clampMediaTimeSec, frameStepSeconds, mediaTimestampMs } from './mediaClock.ts'
import type { FilePlaybackSnapshot } from '../types/file.ts'

export type FileVideoLike = {
  currentTime: number
  duration: number
  paused: boolean
  ended: boolean
  playbackRate: number
  pause(): void
  play(): Promise<void>
}

export function snapshotPlayback(video: FileVideoLike): FilePlaybackSnapshot {
  const durationMs = Number.isFinite(video.duration) ? mediaTimestampMs(video.duration) : 0
  return {
    paused: video.paused || video.ended,
    ended: video.ended,
    currentTimeMs: mediaTimestampMs(video.currentTime),
    durationMs,
  }
}

export async function playFile(video: FileVideoLike): Promise<void> {
  if (!video.paused && !video.ended) return
  try {
    await video.play()
  } catch {
    // Autoplay may be blocked; caller treats metadata-ready as playable.
  }
}

export function pauseFile(video: FileVideoLike): void {
  if (!video.paused) video.pause()
}

export function toggleFilePlayback(video: FileVideoLike): void {
  if (video.paused || video.ended) {
    void playFile(video)
    return
  }
  pauseFile(video)
}

export function seekFile(video: FileVideoLike, timeSec: number): number {
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const next = clampMediaTimeSec(timeSec, duration)
  video.currentTime = next
  return next
}

export function restartFile(video: FileVideoLike): void {
  video.currentTime = 0
  void playFile(video)
}

export function stepFileFrame(video: FileVideoLike, direction: -1 | 1, fps = 30): number {
  const dt = frameStepSeconds(fps) * direction
  pauseFile(video)
  return seekFile(video, video.currentTime + dt)
}
