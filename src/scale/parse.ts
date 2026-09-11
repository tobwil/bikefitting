import {
  PERSPECTIVE_CONDITIONS,
  PLANE_SCALE_SCHEMA_VERSION,
  SCALE_PURPOSES,
  SCALE_STATUSES,
  SCALE_STORAGE_KEY,
  SCALE_UNITS,
  type PerspectiveCondition,
  type PlaneScale,
  type PlaneScaleBinding,
  type PlaneScaleReference,
  type ScaleIndependentCheck,
  type ScalePurpose,
  type ScaleUnit,
} from '../types/scale.ts'
import { emptyPlaneScale, scaleForBinding } from './plane.ts'

export type ScaleStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type ParseOk<T> = { ok: true; value: T }
export type ParseFail = { ok: false; reason: string }
export type ParseResult<T> = ParseOk<T> | ParseFail

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parsePoint(value: unknown): { x: number; y: number } | null {
  if (!isPlainObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null
  return { x: value.x, y: value.y }
}

function parseCheck(value: unknown): ScaleIndependentCheck | null {
  if (value === null) return null
  if (!isPlainObject(value)) return null
  const a = parsePoint(value.points && isPlainObject(value.points) ? value.points.a : null)
  const b = parsePoint(value.points && isPlainObject(value.points) ? value.points.b : null)
  if (!a || !b) return null
  if (!isFiniteNumber(value.knownValue) || !isFiniteNumber(value.residualRel)) return null
  if (typeof value.unit !== 'string' || !SCALE_UNITS.includes(value.unit as ScaleUnit)) return null
  if (typeof value.passed !== 'boolean') return null
  return {
    points: { a, b },
    knownValue: value.knownValue,
    unit: value.unit as ScaleUnit,
    residualRel: value.residualRel,
    passed: value.passed,
  }
}

function parseBinding(value: unknown): PlaneScaleBinding | null | undefined {
  if (value === undefined || value === null) return value === null ? null : undefined
  if (!isPlainObject(value)) return null
  if (value.source !== 'camera' && value.source !== 'synthetic' && value.source !== 'file') return null
  if (typeof value.sourceId !== 'string' || value.sourceId.trim() === '') return null
  if (!isFiniteNumber(value.width) || !isFiniteNumber(value.height)) return null
  if (typeof value.setupId !== 'string' || value.setupId.trim() === '') return null
  if (!isFiniteNumber(value.imageGeneration)) return null
  return {
    source: value.source,
    sourceId: value.sourceId,
    width: value.width,
    height: value.height,
    setupId: value.setupId,
    imageGeneration: value.imageGeneration,
  }
}

function parseReference(value: unknown): PlaneScaleReference | null {
  if (!isPlainObject(value)) return null
  if (typeof value.id !== 'string' || value.id.trim() === '') return null
  if (value.plane !== 'sagittal') return null
  if (typeof value.purpose !== 'string' || !SCALE_PURPOSES.includes(value.purpose as ScalePurpose)) return null
  if (!isPlainObject(value.points)) return null
  const a = parsePoint(value.points.a)
  const b = parsePoint(value.points.b)
  if (!a || !b) return null
  if (!isFiniteNumber(value.measuredValue)) return null
  if (typeof value.unit !== 'string' || !SCALE_UNITS.includes(value.unit as ScaleUnit)) return null
  if (typeof value.perspective !== 'string' || !PERSPECTIVE_CONDITIONS.includes(value.perspective as PerspectiveCondition)) {
    return null
  }
  if (!isPlainObject(value.uncertainty) || !isFiniteNumber(value.uncertainty.value)) return null
  if (value.uncertainty.source !== 'user' && value.uncertainty.source !== 'unknown') return null
  if (typeof value.confirmed !== 'boolean') return null
  const check = value.check === undefined ? null : parseCheck(value.check)
  if (value.check !== undefined && value.check !== null && !check) return null
  return {
    id: value.id,
    plane: 'sagittal',
    purpose: value.purpose as ScalePurpose,
    points: { a, b },
    measuredValue: value.measuredValue,
    unit: value.unit as ScaleUnit,
    perspective: value.perspective as PerspectiveCondition,
    uncertainty: { value: value.uncertainty.value, source: value.uncertainty.source },
    confirmed: value.confirmed,
    check,
  }
}

export function parsePlaneScale(value: unknown): ParseResult<PlaneScale | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.scale must be an object or null' }
  if (value.schemaVersion !== PLANE_SCALE_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported scale.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (typeof value.status !== 'string' || !SCALE_STATUSES.includes(value.status as PlaneScale['status'])) {
    return { ok: false, reason: 'result.scale.status is not a known status' }
  }
  if (!Array.isArray(value.references)) return { ok: false, reason: 'result.scale.references must be an array' }
  const references: PlaneScaleReference[] = []
  for (const entry of value.references) {
    const ref = parseReference(entry)
    if (!ref) return { ok: false, reason: 'result.scale.references contains an invalid reference' }
    references.push(ref)
  }
  if (!(value.pixelsPerUnit === null || isFiniteNumber(value.pixelsPerUnit))) {
    return { ok: false, reason: 'result.scale.pixelsPerUnit must be a finite number or null' }
  }
  if (!(value.unit === null || (typeof value.unit === 'string' && SCALE_UNITS.includes(value.unit as ScaleUnit)))) {
    return { ok: false, reason: 'result.scale.unit must be mm, cm, in, or null' }
  }
  if (!Array.isArray(value.notes) || value.notes.some((note) => typeof note !== 'string')) {
    return { ok: false, reason: 'result.scale.notes must be a string array' }
  }
  if (value.defaultWheelDiameter !== false) {
    return { ok: false, reason: 'result.scale.defaultWheelDiameter must be false' }
  }
  if (value.productLengthAdvice !== false) {
    return { ok: false, reason: 'result.scale.productLengthAdvice must be false' }
  }
  let binding: PlaneScaleBinding | null = null
  if (value.binding !== undefined) {
    const parsedBinding = parseBinding(value.binding)
    if (parsedBinding === undefined || (value.binding !== null && parsedBinding === null)) {
      return { ok: false, reason: 'result.scale.binding is invalid' }
    }
    binding = parsedBinding ?? null
  }
  return {
    ok: true,
    value: {
      schemaVersion: PLANE_SCALE_SCHEMA_VERSION,
      status: value.status as PlaneScale['status'],
      references,
      pixelsPerUnit: value.pixelsPerUnit,
      unit: value.unit as PlaneScale['unit'],
      notes: value.notes as string[],
      defaultWheelDiameter: false,
      productLengthAdvice: false,
      binding,
    },
  }
}

function defaultStorage(): ScaleStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function peekStoredScale(storage: ScaleStorage | null = defaultStorage()): PlaneScale {
  try {
    const raw = storage?.getItem(SCALE_STORAGE_KEY)
    if (!raw) return emptyPlaneScale()
    const parsed = parsePlaneScale(JSON.parse(raw))
    return parsed.ok && parsed.value ? parsed.value : emptyPlaneScale()
  } catch {
    return emptyPlaneScale()
  }
}

export function loadStoredScale(
  current?: PlaneScaleBinding | null,
  storage: ScaleStorage | null = defaultStorage(),
): PlaneScale {
  const stored = peekStoredScale(storage)
  if (!current) return emptyPlaneScale()
  return scaleForBinding(stored, current)
}

export function saveStoredScale(
  scale: PlaneScale,
  storage: ScaleStorage | null = defaultStorage(),
): PlaneScale {
  const next: PlaneScale = { ...scale, defaultWheelDiameter: false, productLengthAdvice: false }
  storage?.setItem(SCALE_STORAGE_KEY, JSON.stringify(next))
  return next
}
