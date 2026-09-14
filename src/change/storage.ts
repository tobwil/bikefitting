import type { DocumentedChange } from '../types/change.ts'
import { parseDocumentedChange } from './schema.ts'

export const PENDING_CHANGE_STORAGE_KEY = 'bikefit.change.pending.v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): StorageLike | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function readPendingChange(storage: StorageLike | null = defaultStorage()): DocumentedChange | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_CHANGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = parseDocumentedChange(JSON.parse(raw) as unknown)
    return parsed.ok ? parsed.value ?? null : null
  } catch {
    return null
  }
}

export function writePendingChange(
  value: DocumentedChange,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(PENDING_CHANGE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* quota / private mode */
  }
}

export function clearPendingChange(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(PENDING_CHANGE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
