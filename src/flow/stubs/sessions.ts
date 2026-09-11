import { FLOW_SIDECAR_KEY } from '../sessionAlign.ts'
import { hydrateSavedSession } from '../buildResult.ts'
import type { SavedSession } from '../types.ts'
import type { SessionsApi } from '../contracts.ts'

function readAll(): SavedSession[] {
  try {
    const raw = localStorage.getItem(FLOW_SIDECAR_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map((row) => hydrateSavedSession(row)).filter((row): row is SavedSession => row !== null)
  } catch {
    return []
  }
}

function writeAll(rows: SavedSession[]) {
  localStorage.setItem(FLOW_SIDECAR_KEY, JSON.stringify(rows))
}

export const stubSessions: SessionsApi = {
  source: 'stub',
  async list() {
    return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async get(id) {
    return readAll().find((row) => row.id === id) ?? null
  },
  async save(session) {
    const rows = readAll().filter((row) => row.id !== session.id)
    rows.push(session)
    writeAll(rows)
    return session
  },
  async remove(id) {
    writeAll(readAll().filter((row) => row.id !== id))
  },
}
