import { SESSIONS_STORAGE_KEY } from '../constants.ts'
import type { SavedSession } from '../types.ts'
import type { SessionsApi } from '../contracts.ts'

function readAll(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedSession[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows: SavedSession[]) {
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(rows))
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
