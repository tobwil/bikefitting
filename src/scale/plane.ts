import type { PixelPoint } from '../types/calibration.ts'
import {
  PLANE_SCALE_SCHEMA_VERSION,
  type PerspectiveCondition,
  type PlaneScale,
  type PlaneScaleReference,
  type ScaleIndependentCheck,
  type ScalePurpose,
  type ScaleUnit,
  type ScaleUncertainty,
} from '../types/scale.ts'
import { convertUnit, pixelDistance } from './units.ts'

export const INDEPENDENT_CHECK_MAX_RESIDUAL = 0.05

/** ISO 622 / “700c” — never used as an implicit product default. */
export const FORBIDDEN_WHEEL_DEFAULTS_MM = [622, 622.3, 700] as const

export function emptyPlaneScale(): PlaneScale {
  return {
    schemaVersion: PLANE_SCALE_SCHEMA_VERSION,
    status: 'absent',
    references: [],
    pixelsPerUnit: null,
    unit: null,
    notes: ['Kein Maßstab. Längenangaben bleiben aus.'],
    defaultWheelDiameter: false,
    productLengthAdvice: false,
  }
}

export type ScaleDraftInput = {
  id?: string
  purpose: ScalePurpose
  a: PixelPoint
  b: PixelPoint
  measuredValue: number
  unit: ScaleUnit
  perspective: PerspectiveCondition
  uncertainty: ScaleUncertainty
}

export function newScaleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `scale_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function pixelsPerUnitOf(points: { a: PixelPoint; b: PixelPoint }, measuredValue: number): number | null {
  if (!(measuredValue > 0) || !Number.isFinite(measuredValue)) return null
  const px = pixelDistance(points.a, points.b)
  if (!(px > 1e-6)) return null
  return px / measuredValue
}

/**
 * Refuse inventing a wheel diameter. A user-typed 62.2 cm is allowed only
 * when they also placed points — this never fills missing input.
 */
export function refuseImplicitWheelDiameter(input: {
  measuredValue?: number | null
  unit?: ScaleUnit | null
  points?: { a: PixelPoint | null; b: PixelPoint | null } | null
}): { ok: false; reason: string } | { ok: true } {
  const a = input.points?.a
  const b = input.points?.b
  const hasPoints = Boolean(a && b && pixelDistance(a, b) > 1e-6)
  const value = input.measuredValue
  if (!hasPoints) {
    return { ok: false, reason: 'Kein impliziter Raddurchmesser. Zwei Punkte und ein gemessenes Maß sind nötig.' }
  }
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: 'Kein Standard-Raddurchmesser. Bitte das gemessene Maß in der Bildebene eintragen.' }
  }
  return { ok: true }
}

export function isForbiddenWheelDefault(value: number, unit: ScaleUnit): boolean {
  const mm = convertUnit(value, unit, 'mm')
  return FORBIDDEN_WHEEL_DEFAULTS_MM.some((item) => Math.abs(mm - item) < 0.6)
}

export function draftReference(input: ScaleDraftInput): { ok: true; value: PlaneScaleReference } | { ok: false; reason: string } {
  const wheel = refuseImplicitWheelDiameter({
    measuredValue: input.measuredValue,
    unit: input.unit,
    points: { a: input.a, b: input.b },
  })
  if (!wheel.ok) return wheel
  if (pixelDistance(input.a, input.b) < 8) {
    return { ok: false, reason: 'Die Bezugspunkte liegen zu nah. Längere bekannte Strecke in der Bildebene wählen.' }
  }
  if (!Number.isFinite(input.uncertainty.value) || input.uncertainty.value < 0) {
    return { ok: false, reason: 'Unsicherheit muss eine nicht-negative Zahl in derselben Einheit sein.' }
  }
  return {
    ok: true,
    value: {
      id: input.id ?? newScaleId(),
      plane: 'sagittal',
      purpose: input.purpose,
      points: { a: { ...input.a }, b: { ...input.b } },
      measuredValue: input.measuredValue,
      unit: input.unit,
      perspective: input.perspective,
      uncertainty: { ...input.uncertainty },
      confirmed: false,
      check: null,
    },
  }
}

export function runIndependentCheck(
  ref: PlaneScaleReference,
  checkPoints: { a: PixelPoint; b: PixelPoint },
  knownValue: number,
  unit: ScaleUnit,
): { ok: true; value: ScaleIndependentCheck } | { ok: false; reason: string } {
  if (!(knownValue > 0) || !Number.isFinite(knownValue)) {
    return { ok: false, reason: 'Unabhängige Prüflänge muss größer als 0 sein.' }
  }
  const checkPx = pixelDistance(checkPoints.a, checkPoints.b)
  if (checkPx < 8) {
    return { ok: false, reason: 'Prüfpunkte liegen zu nah. Eine zweite bekannte Länge in derselben Ebene setzen.' }
  }
  const ppu = pixelsPerUnitOf(ref.points, ref.measuredValue)
  if (!ppu) return { ok: false, reason: 'Bezug liefert keinen Maßstab.' }
  const implied = checkPx / ppu
  const knownInRefUnit = convertUnit(knownValue, unit, ref.unit)
  const residualRel = Math.abs(implied - knownInRefUnit) / knownInRefUnit
  const uncertaintyRel = ref.measuredValue > 0 ? ref.uncertainty.value / ref.measuredValue : 0
  const limit = Math.max(INDEPENDENT_CHECK_MAX_RESIDUAL, uncertaintyRel)
  return {
    ok: true,
    value: {
      points: { a: { ...checkPoints.a }, b: { ...checkPoints.b } },
      knownValue,
      unit,
      residualRel,
      passed: residualRel <= limit,
    },
  }
}

export function commitCheckedScale(ref: PlaneScaleReference, check: ScaleIndependentCheck): PlaneScale {
  const confirmed = check.passed && ref.purpose === 'length_in_plane' && ref.perspective !== 'oblique'
  const next: PlaneScaleReference = { ...ref, check, confirmed }
  const ppu = confirmed ? pixelsPerUnitOf(ref.points, ref.measuredValue) : null
  const notes: string[] = []
  if (ref.perspective === 'oblique') {
    notes.push('Schräge Perspektive: Maßstab nicht bestätigt. Neu positionieren.')
  } else if (ref.perspective === 'unknown') {
    notes.push('Perspektive unbekannt — Prüfung nur bei Seitenansicht gültig.')
  }
  if (!check.passed) {
    notes.push(
      `Unabhängige Länge weicht um ${(check.residualRel * 100).toFixed(1)} % ab. Maßstab nicht bestätigt.`,
    )
  }
  if (ref.purpose !== 'length_in_plane') {
    notes.push('Stack/Reach sind eigene Bezüge. Dieser Eintrag bestätigt keinen allgemeinen Längenmaßstab.')
  }
  if (confirmed) {
    notes.push('Maßstab an unabhängiger bekannter Länge geprüft. Kein Sattelmaß in mm, kein Produktversprechen.')
  } else if (notes.length === 0) {
    notes.push('Maßstab nicht bestätigt. Längenangaben bleiben aus.')
  }
  return {
    schemaVersion: PLANE_SCALE_SCHEMA_VERSION,
    status: check.passed && confirmed ? 'checked' : 'failed_check',
    references: [next],
    pixelsPerUnit: confirmed ? ppu : null,
    unit: confirmed ? ref.unit : null,
    notes,
    defaultWheelDiameter: false,
    productLengthAdvice: false,
  }
}

export function storeDraftScale(ref: PlaneScaleReference): PlaneScale {
  return {
    schemaVersion: PLANE_SCALE_SCHEMA_VERSION,
    status: 'draft',
    references: [{ ...ref, confirmed: false, check: null }],
    pixelsPerUnit: null,
    unit: null,
    notes: ['Entwurf — unabhängige Prüflänge fehlt. Längenangaben bleiben aus.'],
    defaultWheelDiameter: false,
    productLengthAdvice: false,
  }
}

export function scaleIsConfirmed(scale: PlaneScale | null | undefined): boolean {
  if (!scale || scale.status !== 'checked') return false
  return scale.references.some((ref) => ref.confirmed && ref.check?.passed && ref.purpose === 'length_in_plane')
}
