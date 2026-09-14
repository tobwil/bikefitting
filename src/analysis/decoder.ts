import type { AnalysisDecoderKind } from '../types/analysis.ts'

export type DecodedMediaFrame = {
  plannedTimeMs: number
  mediaTimeMs: number
  duplicate: boolean
  width: number
  height: number
  bitmap: ImageBitmap | null
  release: () => void
}

export type MediaDecoder = {
  kind: AnalysisDecoderKind
  /** HTML seek fallback is never frame-accurate. */
  frameAccurate: false
  durationMs: number
  width: number
  height: number
  read(plannedTimeMs: number): Promise<DecodedMediaFrame>
  close(): void
}

const DUPLICATE_EPS_MS = 1.5

function emptyRelease(): void {
  /* no bitmap */
}

export function isDuplicateMediaTime(actualMs: number, lastEmittedMs: number | null): boolean {
  if (lastEmittedMs == null) return false
  return Math.abs(actualMs - lastEmittedMs) < DUPLICATE_EPS_MS
}

export function createInjectedDecoder(input: {
  durationMs: number
  width?: number
  height?: number
  /** Actual media time delivered for each planned time (same length or a mapper). */
  actualTimeMs?: (plannedTimeMs: number, index: number) => number
}): MediaDecoder {
  let index = 0
  let lastEmitted: number | null = null
  const width = input.width ?? 1280
  const height = input.height ?? 720
  const actual = input.actualTimeMs ?? ((planned) => planned)
  return {
    kind: 'injected',
    frameAccurate: false,
    durationMs: input.durationMs,
    width,
    height,
    async read(plannedTimeMs) {
      const mediaTimeMs = actual(plannedTimeMs, index)
      index += 1
      const duplicate = isDuplicateMediaTime(mediaTimeMs, lastEmitted)
      if (!duplicate) lastEmitted = mediaTimeMs
      return {
        plannedTimeMs,
        mediaTimeMs,
        duplicate,
        width,
        height,
        bitmap: null,
        release: emptyRelease,
      }
    },
    close() {
      index = 0
      lastEmitted = null
    },
  }
}

function waitSeek(video: HTMLVideoElement, timeSec: number): Promise<number> {
  return new Promise((resolve) => {
    const finish = () => {
      video.removeEventListener('seeked', finish)
      window.clearTimeout(timer)
      resolve(video.currentTime)
    }
    const timer = window.setTimeout(finish, 1200)
    video.addEventListener('seeked', finish)
    try {
      video.currentTime = timeSec
    } catch {
      finish()
    }
  })
}

/**
 * HTMLVideo seek fallback. Delivered `currentTime` is checked; duplicates are dropped.
 * `frameAccurate` stays false — the browser does not promise original frames.
 */
export async function createHtmlVideoDecoder(blob: Blob, durationMs: number): Promise<MediaDecoder> {
  if (typeof document === 'undefined') {
    throw new Error('HTML video decoder needs a document')
  }
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('decode timeout')), 8000)
    const ok = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', ok)
      video.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadedmetadata', ok)
      video.removeEventListener('error', fail)
      reject(new Error('decode'))
    }
    video.addEventListener('loadedmetadata', ok)
    video.addEventListener('error', fail)
  })
  const width = video.videoWidth
  const height = video.videoHeight
  if (width < 2 || height < 2) {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
    throw new Error('decode')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
    throw new Error('decode')
  }
  let lastEmitted: number | null = null
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
  return {
    kind: 'html_video_seek',
    frameAccurate: false,
    durationMs,
    width,
    height,
    async read(plannedTimeMs) {
      if (closed) {
        return {
          plannedTimeMs,
          mediaTimeMs: plannedTimeMs,
          duplicate: true,
          width,
          height,
          bitmap: null,
          release: emptyRelease,
        }
      }
      const actualSec = await waitSeek(video, plannedTimeMs / 1000)
      const mediaTimeMs = actualSec * 1000
      const duplicate = isDuplicateMediaTime(mediaTimeMs, lastEmitted)
      if (duplicate) {
        return {
          plannedTimeMs,
          mediaTimeMs,
          duplicate: true,
          width,
          height,
          bitmap: null,
          release: emptyRelease,
        }
      }
      lastEmitted = mediaTimeMs
      ctx.drawImage(video, 0, 0, width, height)
      let bitmap: ImageBitmap | null = null
      if (typeof createImageBitmap === 'function') {
        bitmap = await createImageBitmap(canvas)
      }
      return {
        plannedTimeMs,
        mediaTimeMs,
        duplicate: false,
        width,
        height,
        bitmap,
        release: () => {
          try {
            bitmap?.close()
          } catch {
            /* transferred to worker */
          }
          bitmap = null
        },
      }
    },
    close,
  }
}

export function detectDecoderKind(): AnalysisDecoderKind {
  return typeof document === 'undefined' ? 'injected' : 'html_video_seek'
}
