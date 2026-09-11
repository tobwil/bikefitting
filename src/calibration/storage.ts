import {
  CALIBRATION_SCHEMA_VERSION,
  CALIBRATION_STORAGE_KEY,
  type BikeCalibration,
  type BikeDetectMeta,
  type BikeMarkId,
  type CalibrationBinding,
  type MarkProvenance,
  type PixelPoint,
} from '../types/calibration.ts'
import { computePixelBikeTransform } from './transform.ts'

export function emptyCalibration(binding: CalibrationBinding | null = null): BikeCalibration {
  const now = new Date().toISOString()
  return {
    version: CALIBRATION_SCHEMA_VERSION,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: now,
    updatedAt: now,
    binding,
    detect: null,
    provenance: null,
  }
}

function isPoint(value: unknown): value is PixelPoint {
  if (!value || typeof value !== 'object') return false
  const p = value as PixelPoint
  return Number.isFinite(p.x) && Number.isFinite(p.y)
}

const ORIGINS: ReadonlySet<string> = new Set(['auto', 'manual', 'corrected'])
const STATUSES: ReadonlySet<string> = new Set(['proposed', 'confirmed', 'corrected', 'undetermined'])
const GRIPS: ReadonlySet<string> = new Set(['bike_ref', 'hand'])

function isProvenance(value: unknown): value is MarkProvenance {
  if (!value || typeof value !== 'object') return false
  const p = value as MarkProvenance
  return (
    ORIGINS.has(p.origin) &&
    STATUSES.has(p.status) &&
    Number.isFinite(p.visibility) &&
    Number.isFinite(p.confidence) &&
    typeof p.occluded === 'boolean' &&
    typeof p.uncertain === 'boolean' &&
    (p.gripKind === undefined || GRIPS.has(p.gripKind))
  )
}

function parseProvenanceMap(value: unknown): BikeCalibration['provenance'] {
  if (value == null || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const next: NonNullable<BikeCalibration['provenance']> = {}
  for (const id of ['B', 'S', 'G'] as const) {
    if (isProvenance(raw[id])) next[id] = raw[id]
  }
  return Object.keys(next).length > 0 ? next : null
}

function parseDetectMeta(value: unknown): BikeDetectMeta | null {
  if (!value || typeof value !== 'object') return null
  const d = value as BikeDetectMeta
  if (!d.version || typeof d.version !== 'object') return null
  if (typeof d.version.detector !== 'string' || d.version.detector.length === 0) return null
  if (!(d.version.model === null || typeof d.version.model === 'string')) return null
  if (typeof d.riderPresent !== 'boolean') return null
  if (d.gripContact !== 'unconfirmed' && d.gripContact !== 'bike_ref' && d.gripContact !== 'hand') return null
  return {
    version: { detector: d.version.detector, model: d.version.model },
    riderPresent: d.riderPresent,
    gripContact: d.gripContact,
  }
}

function isBinding(value: unknown): value is CalibrationBinding {
  if (!value || typeof value !== 'object') return false
  const b = value as CalibrationBinding
  return (
    (b.source === 'camera' || b.source === 'synthetic') &&
    (b.deviceId === null || typeof b.deviceId === 'string') &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    typeof b.setupId === 'string' &&
    b.setupId.length > 0
  )
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
      binding: isBinding(parsed.binding) ? parsed.binding : null,
      detect: parseDetectMeta(parsed.detect),
      provenance: parseProvenanceMap(parsed.provenance),
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
