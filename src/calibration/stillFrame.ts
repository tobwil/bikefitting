import { imageFromImageData, toImageData, type PixelImage } from './pixels.ts'

/** Copy the current video frame onto a still canvas at source resolution. */
export function captureStillFrame(
  video: HTMLVideoElement,
  still: HTMLCanvasElement,
): boolean {
  const width = video.videoWidth
  const height = video.videoHeight
  if (width < 2 || height < 2) return false
  if (still.width !== width) still.width = width
  if (still.height !== height) still.height = height
  const ctx = still.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(video, 0, 0, width, height)
  return true
}

export function clearStillFrame(still: HTMLCanvasElement | null) {
  if (!still) return
  const ctx = still.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, still.width, still.height)
}

/** Same pixel grid as the captured still — detect and clicks share these coords. */
export function readStillPixels(still: HTMLCanvasElement): PixelImage | null {
  if (still.width < 2 || still.height < 2) return null
  const ctx = still.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  return imageFromImageData(ctx.getImageData(0, 0, still.width, still.height))
}

export function paintStillImage(still: HTMLCanvasElement, image: PixelImage): boolean {
  if (still.width !== image.width) still.width = image.width
  if (still.height !== image.height) still.height = image.height
  const ctx = still.getContext('2d')
  if (!ctx) return false
  ctx.putImageData(toImageData(image), 0, 0)
  return true
}
