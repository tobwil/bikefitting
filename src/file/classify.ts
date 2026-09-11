import type { FileMediaKind } from '../types/file.ts'

const VIDEO_EXT = new Set([
  'mp4',
  'm4v',
  'webm',
  'mov',
  'mkv',
  'ogv',
  'avi',
])

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])

export const FILE_ACCEPT = 'video/*,image/*,.mp4,.mov,.webm,.m4v,.png,.jpg,.jpeg,.webp'

export type ClassifiedLocalFile =
  | { ok: true; kind: FileMediaKind }
  | { ok: false; error: string }

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function classifyLocalFile(file: Pick<File, 'name' | 'type' | 'size'>): ClassifiedLocalFile {
  if (!file || file.size <= 0) {
    return { ok: false, error: 'Die Datei ist leer oder unlesbar. Bitte eine lokale Video- oder Bilddatei wählen.' }
  }
  const type = (file.type || '').toLowerCase()
  const ext = extensionOf(file.name)

  if (type.startsWith('video/') || VIDEO_EXT.has(ext)) {
    return { ok: true, kind: 'video' }
  }
  if (type.startsWith('image/') || IMAGE_EXT.has(ext)) {
    return { ok: true, kind: 'image' }
  }
  return {
    ok: false,
    error:
      'Diese Datei ist kein abspielbares Video oder Bild. MP4, WebM, MOV oder PNG/JPEG wählen — die Datei bleibt lokal, kein Upload.',
  }
}

export function staticCheckFromKind(kind: FileMediaKind): boolean {
  return kind === 'image'
}
