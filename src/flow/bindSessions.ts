import { getSessionBackend } from '../sessions/storage.ts'
import { alignSessionStores, fromMeasurement, readSidecar, toMeasurement, writeSidecar } from './sessionAlign.ts'
import type { SessionsApi } from './contracts.ts'

export const realSessions: SessionsApi & { alignErrors: string[] } = {
  source: 'module',
  alignErrors: [],
  async list() {
    const aligned = await alignSessionStores({
      sidecar: readSidecar(),
      backend: await getSessionBackend(),
    })
    realSessions.alignErrors = aligned.errors
    return aligned.sessions
  },
  async get(id) {
    const rows = await realSessions.list()
    return rows.find((row) => row.id === id) ?? null
  },
  async save(session) {
    const mapped = toMeasurement(session)
    if (!mapped) throw new Error('Ergebnisdatensatz ungültig — nicht gespeichert.')
    const backend = await getSessionBackend()
    await backend.put(mapped)
    try {
      const rows = readSidecar().filter((row) => row.id !== session.id)
      rows.push(session)
      writeSidecar(rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sidecar-Spiegel fehlgeschlagen'
      throw new Error(`IndexedDB gespeichert, Spiegel fehlgeschlagen: ${message}`)
    }
    realSessions.alignErrors = []
    return session
  },
  async remove(id) {
    writeSidecar(readSidecar().filter((row) => row.id !== id))
    const backend = await getSessionBackend()
    await backend.delete(id)
  },
}

export { fromMeasurement, toMeasurement }
