import { CAPTURE_ERROR_COPY } from './copy.ts'
import { classifyClipCompleteness } from './state.ts'
import type { CaptureCompleteness, CaptureError } from '../types/capture.ts'

export type ClipInspection = {
  decoded: boolean
  durationMs: number
  width: number
  height: number
  completeness: CaptureCompleteness | null
  error: CaptureError | null
}

function waitForVideo(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth >= 2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('loadeddata', done)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('loadeddata', done)
      video.removeEventListener('error', onError)
      reject(new Error('decode'))
    }
    const timer = window.setTimeout(() => {
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('loadeddata', done)
      video.removeEventListener('error', onError)
      if (video.readyState >= 1) resolve()
      else reject(new Error('timeout'))
    }, timeoutMs)
    video.addEventListener('loadedmetadata', done)
    video.addEventListener('loadeddata', done)
    video.addEventListener('error', onError)
  })
}

async function recoverDurationMs(video: HTMLVideoElement, fallbackMs?: number): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration * 1000
  await new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, 1200)
    video.addEventListener('seeked', done)
    try {
      video.currentTime = 1e10
    } catch {
      done()
    }
  })
  if (Number.isFinite(video.currentTime) && video.currentTime > 0.05) {
    const ms = video.currentTime * 1000
    try {
      video.currentTime = 0
    } catch {
      /* ignore */
    }
    return ms
  }
  return fallbackMs && fallbackMs > 0 ? fallbackMs : 0
}

export async function inspectDecodedClip(
  blob: Blob,
  intendedDurationMs: number,
  fallbackDurationMs?: number,
): Promise<ClipInspection> {
  if (typeof document === 'undefined') {
    return {
      decoded: false,
      durationMs: 0,
      width: 0,
      height: 0,
      completeness: null,
      error: { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable },
    }
  }
  if (!blob || blob.size <= 0) {
    return {
      decoded: false,
      durationMs: 0,
      width: 0,
      height: 0,
      completeness: null,
      error: { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable },
    }
  }
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitForVideo(video, 8000)
    try {
      await video.play()
    } catch {
      /* metadata is enough if play() is blocked */
    }
    if (video.videoWidth < 2) {
      await waitForVideo(video, 2000)
    }
    const width = video.videoWidth
    const height = video.videoHeight
    const decoded = width >= 2 && height >= 2
    if (!decoded) {
      return {
        decoded: false,
        durationMs: 0,
        width,
        height,
        completeness: null,
        error: { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable },
      }
    }
    const durationMs = await recoverDurationMs(video, fallbackDurationMs)
    const kind = classifyClipCompleteness({ durationMs, intendedDurationMs })
    if (kind === 'unusable') {
      return {
        decoded: true,
        durationMs,
        width,
        height,
        completeness: null,
        error: { code: 'too_short', message: CAPTURE_ERROR_COPY.too_short },
      }
    }
    return {
      decoded: true,
      durationMs,
      width,
      height,
      completeness: kind,
      error: null,
    }
  } catch {
    return {
      decoded: false,
      durationMs: 0,
      width: 0,
      height: 0,
      completeness: null,
      error: { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable },
    }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
