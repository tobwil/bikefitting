import type { KneeAngleReading, PixelPoint } from '../types/calibration.ts'

const DEGENERATE_LEN = 1e-9

/**
 * Knee angle — camera-near side, 2D pixel plane.
 * Inner θ = atan2(|u × v|, u · v) at the knee (hip–knee–ankle).
 * Flexion φ = 180° − θ. 0° = straight. Numeric only — no Ampel.
 */
export function measureKneeAngle(
  hip: PixelPoint | null,
  knee: PixelPoint | null,
  ankle: PixelPoint | null,
  definition: KneeAngleReading['definition'] = 'flexion',
): KneeAngleReading {
  if (!hip || !knee || !ankle) {
    return { definition, degrees: null, visible: false }
  }
  const ux = hip.x - knee.x
  const uy = hip.y - knee.y
  const vx = ankle.x - knee.x
  const vy = ankle.y - knee.y
  const uLen = Math.hypot(ux, uy)
  const vLen = Math.hypot(vx, vy)
  if (uLen < DEGENERATE_LEN || vLen < DEGENERATE_LEN) {
    return { definition, degrees: null, visible: false }
  }
  const dot = ux * vx + uy * vy
  const cross = ux * vy - uy * vx
  const innerRad = Math.atan2(Math.abs(cross), dot)
  const innerDeg = (innerRad * 180) / Math.PI
  const flexionDeg = 180 - innerDeg
  const degrees = definition === 'inner' ? innerDeg : flexionDeg
  return { definition, degrees, visible: true }
}
