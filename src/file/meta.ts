import type { LocalFileMeta } from '../types/file.ts'

/** Source identity only — metadata must not appear here. */
export function fileSourceKey(file: Pick<LocalFileMeta, 'objectUrl'> | null | undefined): string | null {
  return file?.objectUrl ?? null
}

export function isSameFileBind(
  video: Pick<HTMLVideoElement, 'src' | 'currentSrc' | 'srcObject'>,
  objectUrl: string | null,
): boolean {
  if (!objectUrl) return false
  if (video.srcObject) return false
  return video.src === objectUrl || video.currentSrc === objectUrl
}

export function isSameStreamBind(
  video: Pick<HTMLVideoElement, 'srcObject'>,
  stream: MediaStream | null,
): boolean {
  return stream !== null && video.srcObject === stream
}

/**
 * Metadata patch. Identical values keep the same object so attach effects
 * that depend on file identity do not rebind or call play().
 */
export function applyFileMetaPatch(
  prev: LocalFileMeta | null,
  patch: Partial<LocalFileMeta>,
): LocalFileMeta | null {
  if (!prev) return prev
  let changed = false
  for (const key of Object.keys(patch) as (keyof LocalFileMeta)[]) {
    if (patch[key] === undefined) continue
    if (!Object.is(patch[key], prev[key])) {
      changed = true
      break
    }
  }
  if (!changed) return prev
  return { ...prev, ...patch }
}
