import { parseSession } from '../sessions/schema.ts'
import type { SessionBackend } from '../sessions/storage.ts'
import { CALIBRATION_SCHEMA_VERSION } from '../types/calibration.ts'
import { SESSION_SCHEMA_VERSION, type MeasurementSession } from '../types/session.ts'
import { cloneJson, hydrateSavedSession, resultFromLegacySaved, storageWriteMessage } from './buildResult.ts'
import type { SavedSession } from './types.ts'

export const FLOW_SIDECAR_KEY = 'bikefit.flow-sessions.v1'

export function readSidecar(): SavedSession[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(FLOW_SIDECAR_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((row) => hydrateSavedSession(row)).filter((row): row is SavedSession => row !== null)
  } catch {
    return []
  }
}

export function writeSidecar(rows: SavedSession[]): void {
  localStorage.setItem(FLOW_SIDECAR_KEY, JSON.stringify(rows))
}

function kneeValue(session: SavedSession): number | null {
  const card = session.result.metrics.find((m) => m.id === 'knee_flexion' || m.id === 'kneeFlexion')
  return card?.value ?? null
}

export function toMeasurement(session: SavedSession): MeasurementSession | null {
  const result = session.result
  const now = session.updatedAt
  const raw: MeasurementSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: now,
    capturedAt: result.time.endedAt || now,
    label: session.title,
    conditions: {
      bike: session.title || 'BikeFit',
      side: 'right',
      handPosition: 'hoods',
      calibrationVersion: result.calibration.version ?? CALIBRATION_SCHEMA_VERSION,
    },
    metrics: {
      kneeFlexionDeg: kneeValue(session),
      crankAngleDeg: null,
      pedalPhase01: null,
      pedalRevolutions: result.validRevs,
      inferenceMs: null,
    },
    quality: {
      landmarkVisibility: null,
      poseEngine: result.provenance.capture === 'synthetic' ? 'synthetic' : 'none',
      frameSync: 'none',
      pedalStatus: 'none',
      calibrationReady: result.calibration.transform !== null,
    },
    result: cloneJson(result),
  }
  const parsed = parseSession(raw)
  return parsed.ok ? parsed.value : null
}

export function fromMeasurement(row: MeasurementSession): SavedSession {
  if (row.result) {
    return {
      id: row.id,
      title: row.label || row.result.profile.name || row.id.slice(0, 8),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      result: cloneJson(row.result),
    }
  }
  return {
    id: row.id,
    title: row.label || row.conditions.bike || row.id.slice(0, 8),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    result: resultFromLegacySaved({
      id: row.id,
      title: row.label || row.conditions.bike || row.id.slice(0, 8),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      validRevs: row.metrics.pedalRevolutions,
      targetRevs: row.metrics.pedalRevolutions,
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
      quality: {
        level: row.metrics.kneeFlexionDeg == null ? 'insufficient' : 'ok',
        label: row.metrics.kneeFlexionDeg == null ? 'Qualität unzureichend' : 'Qualität ausreichend',
        validRevs: row.metrics.pedalRevolutions,
        targetRevs: row.metrics.pedalRevolutions,
        lostFrames: 0,
        notes: [],
      },
      calibration: {
        version: row.conditions.calibrationVersion,
        marks: { B: null, S: null, G: null },
        transform: null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
      adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
    }),
  }
}

function resultRank(row: SavedSession): number {
  const cal = row.result.calibration
  const hasMarks = Boolean(cal.marks.B || cal.marks.S || cal.marks.G || cal.transform)
  const hasCards = row.result.metrics.length > 0
  const demo = row.result.provenance.evaluation === 'demo' ? 1 : 0
  return (hasMarks ? 4 : 0) + (hasCards ? 2 : 0) + demo
}

function pickNewer(a: SavedSession, b: SavedSession): SavedSession {
  const rankA = resultRank(a)
  const rankB = resultRank(b)
  if (rankA !== rankB) return rankA > rankB ? a : b
  return a.updatedAt >= b.updatedAt ? a : b
}

export type AlignResult = {
  sessions: SavedSession[]
  errors: string[]
}

/**
 * Merge flow sidecar (`bikefit.flow-sessions.v1`) with the E7 session backend.
 * Backend is source of truth after write-back; sidecar is a full-result mirror.
 */
export async function alignSessionStores(opts: {
  sidecar: SavedSession[]
  backend: SessionBackend
  persistSidecar?: boolean
}): Promise<AlignResult> {
  const errors: string[] = []
  const byId = new Map<string, SavedSession>()

  let backendRows: MeasurementSession[] = []
  try {
    backendRows = await opts.backend.list()
  } catch (err) {
    errors.push(storageWriteMessage(err))
  }

  for (const row of backendRows) {
    byId.set(row.id, fromMeasurement(row))
  }
  for (const side of opts.sidecar) {
    const existing = byId.get(side.id)
    byId.set(side.id, existing ? pickNewer(existing, side) : side)
  }

  const sessions = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const saved of sessions) {
    const mapped = toMeasurement(saved)
    if (!mapped) {
      errors.push(`Speichern fehlgeschlagen: Ergebnisdatensatz ${saved.id.slice(0, 8)} ungültig.`)
      continue
    }
    try {
      await opts.backend.put(mapped)
    } catch (err) {
      errors.push(storageWriteMessage(err))
    }
  }

  if (opts.persistSidecar !== false) {
    try {
      writeSidecar(sessions)
    } catch (err) {
      errors.push(storageWriteMessage(err))
    }
  }

  return { sessions, errors }
}
