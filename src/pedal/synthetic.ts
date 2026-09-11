import type { PixelPoint } from '../types/calibration.ts'

const DEFAULT_ORIGIN: PixelPoint = { x: 160, y: 120 }
const DEFAULT_RADIUS = 60
const CADENCE_RPM = 90
const MARKER_R = 7

/** 0° = TDC; +degrees toward +X. Matches `crankAngleDeg`. */
export function syntheticMarkerPixel(
  timestampMs: number,
  origin: PixelPoint = DEFAULT_ORIGIN,
  radius = DEFAULT_RADIUS,
): PixelPoint {
  const deg = ((timestampMs / 1000) * CADENCE_RPM * 360) / 60
  const rad = ((deg % 360) * Math.PI) / 180
  return {
    x: origin.x + radius * Math.sin(rad),
    y: origin.y - radius * Math.cos(rad),
  }
}

function putPixel(data: ImageData, x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) return
  const i = (y * data.width + x) * 4
  data.data[i] = r
  data.data[i + 1] = g
  data.data[i + 2] = b
  data.data[i + 3] = 255
}

/** Magenta crank-marker frame for the ≥10-rev harness and live VM fixture. */
export function renderSyntheticCrankFrame(
  data: ImageData,
  timestampMs: number,
  origin: PixelPoint = DEFAULT_ORIGIN,
  radius = DEFAULT_RADIUS,
): void {
  const buf = data.data
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 18
    buf[i + 1] = 16
    buf[i + 2] = 14
    buf[i + 3] = 255
  }
  const marker = syntheticMarkerPixel(timestampMs, origin, radius)
  const cx = Math.round(marker.x)
  const cy = Math.round(marker.y)
  const r2 = MARKER_R * MARKER_R
  for (let dy = -MARKER_R; dy <= MARKER_R; dy += 1) {
    for (let dx = -MARKER_R; dx <= MARKER_R; dx += 1) {
      if (dx * dx + dy * dy <= r2) putPixel(data, cx + dx, cy + dy, 255, 43, 214)
    }
  }
}
