import { classifyLocalFile, staticCheckFromKind } from './classify.ts'
import type { LocalFileMeta } from '../types/file.ts'

export type OpenLocalFile =
  | { ok: true; meta: LocalFileMeta }
  | { ok: false; error: string }

export function revokeObjectUrl(url: string | null | undefined) {
  if (!url) return
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* already revoked */
  }
}

export function openLocalFile(file: File): OpenLocalFile {
  const classified = classifyLocalFile(file)
  if (!classified.ok) return classified
  const objectUrl = URL.createObjectURL(file)
  return {
    ok: true,
    meta: {
      kind: classified.kind,
      name: file.name,
      mimeType: file.type || (classified.kind === 'image' ? 'image/*' : 'video/*'),
      sizeBytes: file.size,
      objectUrl,
      width: 0,
      height: 0,
      durationMs: classified.kind === 'image' ? 0 : null,
      staticCheck: staticCheckFromKind(classified.kind),
    },
  }
}

export function createStillImageStream(bitmap: ImageBitmap): { stream: MediaStream; stop: () => void } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(2, bitmap.width)
  canvas.height = Math.max(2, bitmap.height)
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(bitmap, 0, 0)
  const stream = canvas.captureStream(1)
  return {
    stream,
    stop() {
      for (const track of stream.getTracks()) track.stop()
      bitmap.close()
    },
  }
}
