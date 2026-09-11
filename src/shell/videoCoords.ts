import type { PixelPoint } from '../types/calibration.ts'

/** Map a click on the displayed video (object-fit: contain) into source pixels. */
export function clientToVideoPixel(
  video: HTMLVideoElement,
  clientX: number,
  clientY: number,
): PixelPoint | null {
  const rect = video.getBoundingClientRect()
  const srcW = video.videoWidth
  const srcH = video.videoHeight
  if (srcW < 2 || srcH < 2 || rect.width < 2 || rect.height < 2) return null
  const scale = Math.min(rect.width / srcW, rect.height / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale
  const ox = rect.left + (rect.width - drawW) / 2
  const oy = rect.top + (rect.height - drawH) / 2
  const x = (clientX - ox) / scale
  const y = (clientY - oy) / scale
  if (x < 0 || y < 0 || x > srcW || y > srcH) return null
  return { x, y }
}

export function sizeOverlayToVideo(video: HTMLVideoElement, overlay: HTMLCanvasElement) {
  const w = video.videoWidth
  const h = video.videoHeight
  if (w < 2 || h < 2) return
  if (overlay.width !== w) overlay.width = w
  if (overlay.height !== h) overlay.height = h
}
