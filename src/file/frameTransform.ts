import {
  IDENTITY_SOURCE_TRANSFORM,
  type NormRect,
  type RotationDeg,
  type SourceTransform,
} from '../types/file.ts'
import type { PixelPoint } from '../types/calibration.ts'

export { IDENTITY_SOURCE_TRANSFORM }

export function isIdentityTransform(transform: SourceTransform | null | undefined): boolean {
  if (!transform) return true
  return transform.rotation === 0 && (transform.crop === null || isFullCrop(transform.crop))
}

function isFullCrop(crop: NormRect): boolean {
  return crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1
}

export function clampNormRect(crop: NormRect | null): NormRect | null {
  if (!crop) return null
  const x = Math.min(Math.max(0, crop.x), 0.95)
  const y = Math.min(Math.max(0, crop.y), 0.95)
  const width = Math.min(Math.max(0.05, crop.width), 1 - x)
  const height = Math.min(Math.max(0.05, crop.height), 1 - y)
  if (x <= 0 && y <= 0 && width >= 0.999 && height >= 0.999) return null
  return { x, y, width, height }
}

export function rotatedSize(
  width: number,
  height: number,
  rotation: RotationDeg,
): { width: number; height: number } {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height }
}

/** Map original pixels into the rotated frame (clockwise). */
export function rotatePoint(
  point: PixelPoint,
  width: number,
  height: number,
  rotation: RotationDeg,
): PixelPoint {
  const x = point.x
  const y = point.y
  if (rotation === 0) return { x, y }
  if (rotation === 90) return { x: height - y, y: x }
  if (rotation === 180) return { x: width - x, y: height - y }
  return { x: y, y: width - x }
}

/** Inverse of rotatePoint. `width`/`height` are the original frame. */
export function unrotatePoint(
  point: PixelPoint,
  width: number,
  height: number,
  rotation: RotationDeg,
): PixelPoint {
  const x = point.x
  const y = point.y
  if (rotation === 0) return { x, y }
  if (rotation === 90) return { x: y, y: height - x }
  if (rotation === 180) return { x: width - x, y: height - y }
  return { x: width - y, y: x }
}

export function workingSize(
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): { width: number; height: number } {
  const rotated = rotatedSize(origWidth, origHeight, transform.rotation)
  const crop = clampNormRect(transform.crop)
  if (!crop) return rotated
  return {
    width: Math.max(1, Math.round(rotated.width * crop.width)),
    height: Math.max(1, Math.round(rotated.height * crop.height)),
  }
}

function cropOffsetPx(
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): { x: number; y: number } {
  const rotated = rotatedSize(origWidth, origHeight, transform.rotation)
  const crop = clampNormRect(transform.crop)
  if (!crop) return { x: 0, y: 0 }
  return { x: crop.x * rotated.width, y: crop.y * rotated.height }
}

/** Working-frame pixel → original file pixel. */
export function workingToOriginal(
  point: PixelPoint,
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): PixelPoint {
  const off = cropOffsetPx(origWidth, origHeight, transform)
  return unrotatePoint({ x: point.x + off.x, y: point.y + off.y }, origWidth, origHeight, transform.rotation)
}

/** Original file pixel → working-frame pixel (or null if cropped out). */
export function originalToWorking(
  point: PixelPoint,
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): PixelPoint | null {
  const rotated = rotatePoint(point, origWidth, origHeight, transform.rotation)
  const off = cropOffsetPx(origWidth, origHeight, transform)
  const next = { x: rotated.x - off.x, y: rotated.y - off.y }
  const size = workingSize(origWidth, origHeight, transform)
  if (next.x < -0.5 || next.y < -0.5 || next.x > size.width + 0.5 || next.y > size.height + 0.5) {
    return null
  }
  return next
}

export function nextRotation(current: RotationDeg): RotationDeg {
  if (current === 0) return 90
  if (current === 90) return 180
  if (current === 180) return 270
  return 0
}

export function insetCrop(fraction = 0.1): NormRect {
  const f = Math.min(Math.max(0, fraction), 0.45)
  return { x: f, y: f, width: 1 - 2 * f, height: 1 - 2 * f }
}

export type LandmarkLike = { x: number; y: number; z: number; visibility?: number; presence?: number }

/** MediaPipe-normalized landmarks in the working image → normalized in the original file. */
export function remapLandmarksToOriginal<T extends LandmarkLike>(
  landmarks: readonly T[],
  workingWidth: number,
  workingHeight: number,
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): T[] {
  if (isIdentityTransform(transform) || origWidth < 2 || origHeight < 2) {
    return landmarks.map((lm) => ({ ...lm }))
  }
  return landmarks.map((lm) => {
    const px = workingToOriginal(
      { x: lm.x * workingWidth, y: lm.y * workingHeight },
      origWidth,
      origHeight,
      transform,
    )
    return { ...lm, x: px.x / origWidth, y: px.y / origHeight }
  })
}

export function drawSourceTransform(
  ctx: CanvasRenderingContext2D,
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
): void {
  const crop = clampNormRect(transform.crop)
  if (!crop && transform.rotation === 0) return
  const rotated = rotatedSize(origWidth, origHeight, transform.rotation)
  if (crop) {
    const x = crop.x * rotated.width
    const y = crop.y * rotated.height
    const w = crop.width * rotated.width
    const h = crop.height * rotated.height
    const origTl = unrotatePoint({ x, y }, origWidth, origHeight, transform.rotation)
    const origBr = unrotatePoint({ x: x + w, y: y + h }, origWidth, origHeight, transform.rotation)
    const left = Math.min(origTl.x, origBr.x)
    const top = Math.min(origTl.y, origBr.y)
    const width = Math.abs(origBr.x - origTl.x)
    const height = Math.abs(origBr.y - origTl.y)
    ctx.save()
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.strokeRect(left, top, width, height)
    ctx.restore()
  }
}

/**
 * Draw the original bitmap into a working canvas (rotate then crop).
 * Used by the live loop; mapping back is workingToOriginal.
 */
export function blitWorkingFrame(
  source: CanvasImageSource,
  origWidth: number,
  origHeight: number,
  transform: SourceTransform,
  dest: HTMLCanvasElement,
): boolean {
  const size = workingSize(origWidth, origHeight, transform)
  if (size.width < 2 || size.height < 2) return false
  if (dest.width !== size.width) dest.width = size.width
  if (dest.height !== size.height) dest.height = size.height
  const ctx = dest.getContext('2d')
  if (!ctx) return false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, dest.width, dest.height)
  const rotated = rotatedSize(origWidth, origHeight, transform.rotation)
  const crop = clampNormRect(transform.crop)
  const cx = crop ? crop.x * rotated.width : 0
  const cy = crop ? crop.y * rotated.height : 0
  ctx.save()
  ctx.translate(-cx, -cy)
  if (transform.rotation === 90) {
    ctx.translate(rotated.width, 0)
    ctx.rotate(Math.PI / 2)
  } else if (transform.rotation === 180) {
    ctx.translate(rotated.width, rotated.height)
    ctx.rotate(Math.PI)
  } else if (transform.rotation === 270) {
    ctx.translate(0, rotated.height)
    ctx.rotate(-Math.PI / 2)
  }
  ctx.drawImage(source, 0, 0, origWidth, origHeight)
  ctx.restore()
  return true
}
