import {
  SESSION_DB_NAME,
  SESSION_DB_STORE,
  SESSION_DB_VERSION,
  SESSION_SCHEMA_VERSION,
  SESSION_STORAGE_KEY,
  type MeasurementSession,
  type SessionBackendKind,
} from '../types/session.ts'
import { parseSession } from './schema.ts'

export type SessionBackend = {
  kind: SessionBackendKind
  list(): Promise<MeasurementSession[]>
  put(session: MeasurementSession): Promise<void>
  delete(id: string): Promise<void>
  clear(): Promise<void>
}

function waitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

function waitTx(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(SESSION_DB_STORE)) {
        db.createObjectStore(SESSION_DB_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

function keepValid(records: unknown[]): MeasurementSession[] {
  const out: MeasurementSession[] = []
  for (const record of records) {
    const parsed = parseSession(record)
    if (parsed.ok) out.push(parsed.value)
  }
  return out.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt) || b.id.localeCompare(a.id))
}

export function createMemoryBackend(seed: MeasurementSession[] = []): SessionBackend {
  const map = new Map<string, MeasurementSession>(seed.map((s) => [s.id, s]))
  return {
    kind: 'memory',
    async list() {
      return keepValid([...map.values()])
    },
    async put(session) {
      const parsed = parseSession(session)
      if (!parsed.ok) throw new Error(parsed.reason)
      map.set(parsed.value.id, parsed.value)
    },
    async delete(id) {
      map.delete(id)
    },
    async clear() {
      map.clear()
    },
  }
}

function createLocalStorageBackend(): SessionBackend {
  const read = (): MeasurementSession[] => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return []
      const rec = parsed as { schemaVersion?: unknown; sessions?: unknown }
      if (rec.schemaVersion !== SESSION_SCHEMA_VERSION || !Array.isArray(rec.sessions)) return []
      return keepValid(rec.sessions)
    } catch {
      return []
    }
  }
  const write = (sessions: MeasurementSession[]) => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: SESSION_SCHEMA_VERSION, sessions }),
    )
  }
  return {
    kind: 'localStorage',
    async list() {
      return read()
    },
    async put(session) {
      const parsed = parseSession(session)
      if (!parsed.ok) throw new Error(parsed.reason)
      const next = read().filter((s) => s.id !== parsed.value.id)
      next.push(parsed.value)
      write(next)
    },
    async delete(id) {
      write(read().filter((s) => s.id !== id))
    },
    async clear() {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    },
  }
}

function createIndexedDbBackend(db: IDBDatabase): SessionBackend {
  return {
    kind: 'indexeddb',
    async list() {
      const tx = db.transaction(SESSION_DB_STORE, 'readonly')
      const req = tx.objectStore(SESSION_DB_STORE).getAll()
      const [rows] = await Promise.all([waitRequest(req), waitTx(tx)])
      return keepValid(rows as unknown[])
    },
    async put(session) {
      const parsed = parseSession(session)
      if (!parsed.ok) throw new Error(parsed.reason)
      const tx = db.transaction(SESSION_DB_STORE, 'readwrite')
      tx.objectStore(SESSION_DB_STORE).put(parsed.value)
      await waitTx(tx)
    },
    async delete(id) {
      const tx = db.transaction(SESSION_DB_STORE, 'readwrite')
      tx.objectStore(SESSION_DB_STORE).delete(id)
      await waitTx(tx)
    },
    async clear() {
      const tx = db.transaction(SESSION_DB_STORE, 'readwrite')
      tx.objectStore(SESSION_DB_STORE).clear()
      await waitTx(tx)
    },
  }
}

async function probeIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null
  let db: IDBDatabase | null = null
  try {
    db = await openIndexedDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction(SESSION_DB_STORE, 'readwrite')
      tx.objectStore(SESSION_DB_STORE).get('__probe__')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return db
  } catch {
    db?.close()
    return null
  }
}

function probeLocalStorage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const key = `${SESSION_STORAGE_KEY}.probe`
    localStorage.setItem(key, '1')
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/** IndexedDB first, then localStorage, then in-memory (this tab only). */
export async function createSessionBackend(): Promise<SessionBackend> {
  const db = await probeIndexedDb()
  if (db) return createIndexedDbBackend(db)
  if (probeLocalStorage()) return createLocalStorageBackend()
  return createMemoryBackend()
}

let cached: Promise<SessionBackend> | null = null

export function getSessionBackend(): Promise<SessionBackend> {
  if (!cached) cached = createSessionBackend()
  return cached
}

/** Test helper — drop the singleton so the next call re-probes. */
export function resetSessionBackendCache(): void {
  cached = null
}
