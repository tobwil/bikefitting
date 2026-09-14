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
  if (video.readyState >= 1 && Number.isFinite(video.duration)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('error', onError)
      reject(new Error('decode'))
    }
    const timer = window.setTimeout(() => {
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('error', onError)
      reject(new Error('timeout'))
    }, timeoutMs)
    video.addEventListener('loadedmetadata', done)
    video.addEventListener('error', onError)
  })
}

export async function inspectDecodedClip(
  blob: Blob,
  intendedDurationMs: number,
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
  video.preload = 'metadata'
  video.src = url
  try {
    await waitForVideo(video, 8000)
    try {
      await video.play()
    } catch {
      /* metadata is enough if play() is blocked */
    }
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0
    const width = video.videoWidth
    const height = video.videoHeight
    const playable = durationMs > 0 && width >= 2 && height >= 2
    if (!playable) {
      return {
        decoded: false,
        durationMs,
        width,
        height,
        completeness: null,
        error: { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable },
      }
    }
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
