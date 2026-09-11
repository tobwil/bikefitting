import {
  CALIBRATION_SCHEMA_VERSION,
  CALIBRATION_STORAGE_KEY,
  type BikeCalibration,
  type BikeMarkId,
  type PixelPoint,
} from '../types/calibration.ts'
import { computePixelBikeTransform } from './transform.ts'

export function emptyCalibration(): BikeCalibration {
  const now = new Date().toISOString()
  return {
    version: CALIBRATION_SCHEMA_VERSION,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: now,
    updatedAt: now,
  }
}

function isPoint(value: unknown): value is PixelPoint {
  if (!value || typeof value !== 'object') return false
  const p = value as PixelPoint
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

export function loadCalibration(): BikeCalibration | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BikeCalibration
    if (parsed.version !== CALIBRATION_SCHEMA_VERSION) return null
    const marks: Record<BikeMarkId, PixelPoint | null> = {
      B: isPoint(parsed.marks?.B) ? parsed.marks.B : null,
      S: isPoint(parsed.marks?.S) ? parsed.marks.S : null,
      G: isPoint(parsed.marks?.G) ? parsed.marks.G : null,
    }
    const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString()
    return {
      version: CALIBRATION_SCHEMA_VERSION,
      marks,
      transform: computePixelBikeTransform(marks),
      createdAt,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : createdAt,
    }
  } catch {
    return null
  }
}

export function saveCalibration(cal: BikeCalibration): BikeCalibration {
  const next = {
    ...cal,
    version: CALIBRATION_SCHEMA_VERSION,
    transform: computePixelBikeTransform(cal.marks),
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(next))
  return next
}
