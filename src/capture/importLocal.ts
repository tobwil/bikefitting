import { classifyLocalFile } from '../file/classify.ts'
import type { CaptureType } from '../types/capture.ts'
import { finalizeCapture } from './finalize.ts'
import type { CaptureStore } from './storage.ts'
import type { CaptureAsset, CaptureError } from '../types/capture.ts'

function importCaptureType(file: File): CaptureType {
  const name = file.name.toLowerCase()
  if (name.endsWith('.mov') || name.endsWith('.m4v') || /iphone|img_|trim\./i.test(file.name)) {
    return 'phone_import'
  }
  return 'file_import'
}

export async function importLocalCapture(
  file: File,
  store: CaptureStore,
): Promise<{ asset: CaptureAsset; blob: Blob } | CaptureError> {
  const classified = classifyLocalFile(file)
  if (!classified.ok || classified.kind !== 'video') {
    return {
      code: 'not_playable',
      message: classified.ok
        ? 'Bitte ein Video wählen. Einzelbilder sind kein Aufnahmeclip.'
        : classified.error,
    }
  }
  const blob = file.slice(0, file.size, file.type || 'video/mp4')
  const mimeType = blob.type || 'video/mp4'
  const extension = mimeType.includes('webm') ? 'webm' : 'mp4'
  const result = await finalizeCapture({
    blob,
    mime: { mimeType, extension, codec: mimeType },
    intendedDurationMs: 0,
    captureType: importCaptureType(file),
    store,
  })
  if ('code' in result) return result
  return result
}
