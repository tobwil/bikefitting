import type { BikeCalibration } from '../types/calibration.ts'
import type { PlaneScale } from '../types/scale.ts'
import { pixelDistance } from './units.ts'
import { scaleIsConfirmed } from './plane.ts'

const LENGTH_CLAIM = /(\d+(?:[.,]\d+)?)\s*(mm|cm|in)\b|genau\s+\d+|sattel\s+genau/i

/** Internal conversion is allowed only after a confirmed, checked plane scale. */
export function lengthAdviceAllowed(scale: PlaneScale | null | undefined): boolean {
  return scaleIsConfirmed(scale)
}

/** This delivery never ships millimetre product promises. */
export function productLengthAdviceAllowed(_scale?: PlaneScale | null): false {
  return false
}

export function looksLikeLengthClaim(text: string): boolean {
  return LENGTH_CLAIM.test(text)
}

export function blockLengthClaim(scale: PlaneScale | null | undefined): string {
  if (!lengthAdviceAllowed(scale)) {
    return 'Längenangaben erst nach bestätigtem Maßstab und unabhängiger Prüfung.'
  }
  return 'Kein Millimeter-Produktversprechen. Bildabstände sind kein Sattelmaß.'
}

export function saddleMmFromImage(scale: PlaneScale | null | undefined): { allowed: false; reason: string } {
  void scale
  return {
    allowed: false,
    reason: 'Bildabstand ist kein Sattelmaß in mm. „Sattel genau x mm“ bleibt aus.',
  }
}

/**
 * Existing S/G marks are bike refs (saddle top, hoods) — not frame stack or reach.
 * Those quantities need their own measured refs in the frame plane.
 */
export function stackReachFromBikeMarks(marks: BikeCalibration['marks']): {
  allowed: false
  reason: string
  sgPixelDistance: number | null
} {
  const sg = marks.S && marks.G ? pixelDistance(marks.S, marks.G) : null
  return {
    allowed: false,
    reason: 'S/G reichen nicht für Stack/Reach. Eigene Bezüge in der Rahmenebene setzen.',
    sgPixelDistance: sg,
  }
}

export function filterLengthAdvice<T extends { title: string; reason: string }>(
  items: readonly T[],
  scale: PlaneScale | null | undefined,
): T[] {
  const blocked = blockLengthClaim(scale)
  return items.map((item) => {
    if (!looksLikeLengthClaim(item.title) && !looksLikeLengthClaim(item.reason)) return item
    return { ...item, title: 'Keine Längenempfehlung', reason: blocked }
  })
}

export function applyConfirmedScaleToPixelsPerMm(): null {
  // Bike transform.pixelsPerMm stays null so pixelToBike never becomes "saddle mm".
  return null
}
