import {
  SESSION_EXPORT_KIND,
  SESSION_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION_LEGACY,
  type MeasurementSession,
  type SessionExportEnvelope,
} from '../types/session.ts'
import { parseSession } from './schema.ts'

export type ImportRejection = {
  index: number
  reason: string
}

export type ImportResult = {
  ok: boolean
  sessions: MeasurementSession[]
  rejected: ImportRejection[]
  error: string | null
}

function isEnvelope(value: unknown): value is SessionExportEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rec = value as Record<string, unknown>
  return rec.kind === SESSION_EXPORT_KIND && Array.isArray(rec.sessions)
}

function collect(rawSessions: unknown[]): ImportResult {
  const sessions: MeasurementSession[] = []
  const rejected: ImportRejection[] = []
  rawSessions.forEach((entry, index) => {
    const parsed = parseSession(entry)
    if (parsed.ok) sessions.push(parsed.value)
    else rejected.push({ index, reason: parsed.reason })
  })
  if (sessions.length === 0) {
    const first = rejected[0]?.reason ?? 'no sessions in payload'
    return {
      ok: false,
      sessions: [],
      rejected,
      error: rejected.length > 0 ? `corrupt data rejected: ${first}` : first,
    }
  }
  return { ok: true, sessions, rejected, error: null }
}

/** Parse JSON text. Rejects invalid JSON and records that fail schema checks. */
export function parseImportJson(raw: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, sessions: [], rejected: [], error: 'invalid JSON' }
  }

  if (Array.isArray(parsed)) return collect(parsed)

  if (isEnvelope(parsed)) {
    if (
      parsed.schemaVersion !== SESSION_SCHEMA_VERSION &&
      parsed.schemaVersion !== SESSION_SCHEMA_VERSION_LEGACY
    ) {
      return {
        ok: false,
        sessions: [],
        rejected: [],
        error: `unsupported export schemaVersion ${String(parsed.schemaVersion)}`,
      }
    }
    return collect(parsed.sessions)
  }

  const single = parseSession(parsed)
  if (single.ok) return { ok: true, sessions: [single.value], rejected: [], error: null }
  return {
    ok: false,
    sessions: [],
    rejected: [{ index: 0, reason: single.reason }],
    error: `corrupt data rejected: ${single.reason}`,
  }
}
