import type { CaptureAsset, CaptureError, CaptureListItem } from '../types/capture.ts'
import {
  CAPTURE_BLOB_STORE,
  CAPTURE_DB_NAME,
  CAPTURE_DB_VERSION,
  CAPTURE_META_STORE,
} from './constants.ts'
import { CAPTURE_ERROR_COPY } from './copy.ts'
import { CAPTURE_ASSET_KIND, CAPTURE_SCHEMA_VERSION } from '../types/capture.ts'

export type CaptureStore = {
  list: () => Promise<CaptureListItem[]>
  get: (captureId: string) => Promise<{ asset: CaptureAsset; blob: Blob } | null>
  put: (asset: CaptureAsset, blob: Blob) => Promise<void>
  delete: (captureId: string) => Promise<void>
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

function isAsset(value: unknown): value is CaptureAsset {
  if (!value || typeof value !== 'object') return false
  const row = value as CaptureAsset
  return (
    row.kind === CAPTURE_ASSET_KIND &&
    row.schemaVersion === CAPTURE_SCHEMA_VERSION &&
    typeof row.captureId === 'string' &&
    typeof row.contentHash === 'string' &&
    typeof row.blobKey === 'string' &&
    row.hasAudio === false
  )
}

function toListItem(asset: CaptureAsset): CaptureListItem {
  return {
    captureId: asset.captureId,
    createdAt: asset.createdAt,
    durationMs: asset.durationMs,
    completeness: asset.completeness,
    captureType: asset.captureType,
    filename: asset.filename,
    byteLength: asset.byteLength,
  }
}

export function classifyPersistError(error: unknown): CaptureError {
  const name = error instanceof DOMException ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return { code: 'quota', message: CAPTURE_ERROR_COPY.quota }
  }
  return { code: 'unknown', message: CAPTURE_ERROR_COPY.unknown }
}

export function createMemoryCaptureStore(seed: CaptureAsset[] = []): CaptureStore {
  const assets = new Map<string, CaptureAsset>()
  const blobs = new Map<string, Blob>()
  for (const asset of seed) assets.set(asset.captureId, asset)
  return {
    async list() {
      return [...assets.values()]
        .map(toListItem)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.captureId.localeCompare(a.captureId))
    },
    async get(captureId) {
      const asset = assets.get(captureId)
      const blob = blobs.get(captureId)
      if (!asset || !blob) return null
      return { asset, blob }
    },
    async put(asset, blob) {
      if (asset.hasAudio !== false) throw new Error('audio forbidden')
      assets.set(asset.captureId, asset)
      blobs.set(asset.captureId, blob)
    },
    async delete(captureId) {
      assets.delete(captureId)
      blobs.delete(captureId)
    },
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CAPTURE_DB_NAME, CAPTURE_DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CAPTURE_META_STORE)) {
        db.createObjectStore(CAPTURE_META_STORE, { keyPath: 'captureId' })
      }
      if (!db.objectStoreNames.contains(CAPTURE_BLOB_STORE)) {
        db.createObjectStore(CAPTURE_BLOB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
}

export function createIndexedDbCaptureStore(): CaptureStore {
  return {
    async list() {
      const db = await openDb()
      try {
        const tx = db.transaction(CAPTURE_META_STORE, 'readonly')
        const rows = await waitRequest(tx.objectStore(CAPTURE_META_STORE).getAll())
        await waitTx(tx)
        return rows
          .filter(isAsset)
          .map(toListItem)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.captureId.localeCompare(a.captureId))
      } finally {
        db.close()
      }
    },
    async get(captureId) {
      const db = await openDb()
      try {
        const tx = db.transaction([CAPTURE_META_STORE, CAPTURE_BLOB_STORE], 'readonly')
        const asset = await waitRequest(tx.objectStore(CAPTURE_META_STORE).get(captureId))
        const blob = await waitRequest(tx.objectStore(CAPTURE_BLOB_STORE).get(captureId))
        await waitTx(tx)
        if (!isAsset(asset) || !(blob instanceof Blob)) return null
        return { asset, blob }
      } finally {
        db.close()
      }
    },
    async put(asset, blob) {
      if (asset.hasAudio !== false) throw new Error('audio forbidden')
      const db = await openDb()
      try {
        const tx = db.transaction([CAPTURE_META_STORE, CAPTURE_BLOB_STORE], 'readwrite')
        tx.objectStore(CAPTURE_META_STORE).put(asset)
        tx.objectStore(CAPTURE_BLOB_STORE).put(blob, asset.captureId)
        await waitTx(tx)
      } finally {
        db.close()
      }
    },
    async delete(captureId) {
      const db = await openDb()
      try {
        const tx = db.transaction([CAPTURE_META_STORE, CAPTURE_BLOB_STORE], 'readwrite')
        tx.objectStore(CAPTURE_META_STORE).delete(captureId)
        tx.objectStore(CAPTURE_BLOB_STORE).delete(captureId)
        await waitTx(tx)
      } finally {
        db.close()
      }
    },
  }
}

let browserStore: CaptureStore | null = null

export function getCaptureStore(): CaptureStore {
  if (typeof indexedDB === 'undefined') return createMemoryCaptureStore()
  browserStore ??= createIndexedDbCaptureStore()
  return browserStore
}

export function downloadCaptureBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
