import type { PixelPoint } from '../types/calibration.ts'

/** 0° = marker at top dead centre relative to B; +degrees toward +X. */
export function crankAngleDeg(marker: PixelPoint, bottomBracket: PixelPoint): number {
  const dx = marker.x - bottomBracket.x
  const dy = marker.y - bottomBracket.y
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

export function phase01FromAngle(angleDeg: number): number {
  return angleDeg / 360
}

export function unwrapDeltaDeg(prev: number, next: number): number {
  let d = next - prev
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

export function fitCircleCenter(points: readonly PixelPoint[]): PixelPoint | null {
  if (points.length < 8) return null
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0
  let sumX3 = 0, sumY3 = 0, sumX2Y = 0, sumXY2 = 0
  for (const p of points) {
    const x = p.x, y = p.y, x2 = x * x, y2 = y * y
    sumX += x; sumY += y; sumX2 += x2; sumY2 += y2; sumXY += x * y
    sumX3 += x2 * x; sumY3 += y2 * y; sumX2Y += x2 * y; sumXY2 += x * y2
  }
  const n = points.length
  const c = n * sumX2 - sumX * sumX
  const d = n * sumXY - sumX * sumY
  const e = n * sumY2 - sumY * sumY
  const g = 0.5 * (n * sumX3 + n * sumXY2 - sumX * (sumX2 + sumY2))
  const h = 0.5 * (n * sumY3 + n * sumX2Y - sumY * (sumX2 + sumY2))
  const denom = c * e - d * d
  if (Math.abs(denom) < 1e-6) return null
  const cx = (g * e - d * h) / denom
  const cy = (c * h - d * g) / denom
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  let meanR = 0
  for (const p of points) meanR += Math.hypot(p.x - cx, p.y - cy)
  meanR /= n
  if (meanR < 12 || meanR > 400) return null
  let varR = 0
  for (const p of points) {
    const r = Math.hypot(p.x - cx, p.y - cy)
    varR += (r - meanR) ** 2
  }
  varR /= n
  if (Math.sqrt(varR) > meanR * 0.25) return null
  return { x: cx, y: cy }
}
