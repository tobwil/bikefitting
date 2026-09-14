import { PREVIEW_STALE_MS } from './constants.ts'

export function isPreviewConnected(input: {
  hasStreamObject: boolean
  playable: boolean
  lastDecodedFrameAtMs: number | null
  nowMs: number
  staleAfterMs?: number
}): boolean {
  if (!input.playable) return false
  if (input.lastDecodedFrameAtMs == null) return false
  const staleAfter = input.staleAfterMs ?? PREVIEW_STALE_MS
  return input.nowMs - input.lastDecodedFrameAtMs <= staleAfter
}

export function attachDecodedFrameWatch(
  video: HTMLVideoElement,
  onFrame: (atMs: number) => void,
): () => void {
  let cancelled = false
  let handle = 0
  const rvfc = typeof video.requestVideoFrameCallback === 'function'
  const tick = (now: number) => {
    if (cancelled) return
    onFrame(now)
    if (rvfc) {
      handle = video.requestVideoFrameCallback(tick)
    } else {
      handle = requestAnimationFrame(tick)
    }
  }
  if (rvfc) {
    handle = video.requestVideoFrameCallback(tick)
  } else {
    handle = requestAnimationFrame(tick)
  }
  return () => {
    cancelled = true
    if (rvfc && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(handle)
    } else {
      cancelAnimationFrame(handle)
    }
  }
}
