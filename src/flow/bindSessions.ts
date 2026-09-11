import { getSessionBackend } from '../sessions/storage.ts'
import { parseSession } from '../sessions/schema.ts'
import { CALIBRATION_SCHEMA_VERSION } from '../types/calibration.ts'
import { SESSION_SCHEMA_VERSION } from '../types/session.ts'
import type { MeasurementSession } from '../types/session.ts'
import type { SessionsApi } from './contracts.ts'
import type { SavedSession } from './types.ts'
import { LAB_PROFILE } from './profile.ts'

const FLOW_SIDECAR_KEY = 'bikefit.flow-sessions.v1'

function readSidecar(): SavedSession[] {
  try {
    const raw = localStorage.getItem(FLOW_SIDECAR_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSidecar(rows: SavedSession[]) {
  localStorage.setItem(FLOW_SIDECAR_KEY, JSON.stringify(rows))
}

function kneeValue(session: SavedSession): number | null {
  const card = session.metrics.find((m) => m.id === 'knee_flexion' || m.id === 'kneeFlexion')
  return card?.value ?? null
}

function toMeasurement(session: SavedSession): MeasurementSession | null {
  const now = session.updatedAt
  const raw: MeasurementSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: now,
    capturedAt: now,
    label: session.title,
    conditions: {
      bike: session.title || 'BikeFit',
      side: 'right',
      handPosition: 'hoods',
      calibrationVersion: session.calibration.version ?? CALIBRATION_SCHEMA_VERSION,
    },
    metrics: {
      kneeFlexionDeg: kneeValue(session),
      crankAngleDeg: null,
      pedalPhase01: null,
      pedalRevolutions: session.validRevs,
      inferenceMs: null,
    },
    quality: {
      landmarkVisibility: null,
      poseEngine: 'none',
      frameSync: 'none',
      pedalStatus: 'none',
      calibrationReady: session.calibration.transform !== null,
    },
  }
  const parsed = parseSession(raw)
  return parsed.ok ? parsed.value : null
}

function fromMeasurement(row: MeasurementSession): SavedSession {
  return {
    id: row.id,
    title: row.label || row.conditions.bike || row.id.slice(0, 8),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    profile: LAB_PROFILE,
    quality: {
      level: row.metrics.kneeFlexionDeg == null ? 'insufficient' : 'ok',
      label: row.metrics.kneeFlexionDeg == null ? 'Qualität unzureichend' : 'Qualität ausreichend',
      validRevs: row.metrics.pedalRevolutions,
      targetRevs: row.metrics.pedalRevolutions,
      lostFrames: 0,
      notes: [],
    },
    metrics: [
      {
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: row.metrics.kneeFlexionDeg,
        unit: '°',
        band: row.metrics.kneeFlexionDeg == null ? 'unknown' : 'in',
        targetHint: 'Numerisch',
      },
    ],
    recommendations: [],
    validRevs: row.metrics.pedalRevolutions,
    targetRevs: row.metrics.pedalRevolutions,
    calibration: {
      version: row.conditions.calibrationVersion,
      marks: { B: null, S: null, G: null },
      transform: null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
  }
}

export const realSessions: SessionsApi = {
  source: 'module',
  async list() {
    const sidecar = readSidecar()
    if (sidecar.length > 0) {
      return [...sidecar].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    const backend = await getSessionBackend()
    const rows = await backend.list()
    return rows.map(fromMeasurement)
  },
  async get(id) {
    const sidecar = readSidecar().find((row) => row.id === id)
    if (sidecar) return sidecar
    const backend = await getSessionBackend()
    const rows = await backend.list()
    const found = rows.find((row) => row.id === id)
    return found ? fromMeasurement(found) : null
  },
  async save(session) {
    const rows = readSidecar().filter((row) => row.id !== session.id)
    rows.push(session)
    writeSidecar(rows)
    const mapped = toMeasurement(session)
    if (mapped) {
      const backend = await getSessionBackend()
      await backend.put(mapped)
    }
    return session
  },
  async remove(id) {
    writeSidecar(readSidecar().filter((row) => row.id !== id))
    const backend = await getSessionBackend()
    await backend.delete(id)
  },
}
