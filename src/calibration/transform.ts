import type { BikeCalibration, PixelBikeTransform, PixelPoint } from '../types/calibration.ts'

export function computePixelBikeTransform(
  marks: BikeCalibration['marks'],
): PixelBikeTransform | null {
  const b = marks.B
  if (!b) return null
  void (marks.S satisfies PixelPoint | null)
  void (marks.G satisfies PixelPoint | null)
  return null
}
