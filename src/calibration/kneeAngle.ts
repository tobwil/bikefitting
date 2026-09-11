import type { KneeAngleReading, PixelPoint } from '../types/calibration.ts'

/** Inner θ at knee; flexion φ = 180° − θ. Numeric only — no Ampel. */
export function measureKneeAngle(
  _hip: PixelPoint | null,
  _knee: PixelPoint | null,
  _ankle: PixelPoint | null,
  definition: KneeAngleReading['definition'] = 'flexion',
): KneeAngleReading {
  return { definition, degrees: null, visible: false }
}
