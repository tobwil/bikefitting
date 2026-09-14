import type { CaptureAsset, CaptureCompleteness, CaptureError, CaptureType } from '../types/capture.ts'
import { CAPTURE_ASSET_KIND, CAPTURE_SCHEMA_VERSION } from '../types/capture.ts'
import { CAPTURE_ERROR_COPY } from './copy.ts'
import { newCaptureId, sha256Hex } from './hash.ts'
import { inspectDecodedClip } from './inspect.ts'
import type { RecorderMime } from './mime.ts'
import { classifyPersistError, type CaptureStore } from './storage.ts'

export async function finalizeCapture(input: {
  blob: Blob
  mime: RecorderMime
  intendedDurationMs: number
  captureType: CaptureType
  store: CaptureStore
  createdAt?: string
}): Promise<{ asset: CaptureAsset; blob: Blob } | CaptureError> {
  if (!input.blob || input.blob.size <= 0) {
    return { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable }
  }
  const inspection = await inspectDecodedClip(input.blob, input.intendedDurationMs)
  if (!inspection.decoded || !inspection.completeness) {
    return inspection.error ?? { code: 'not_playable', message: CAPTURE_ERROR_COPY.not_playable }
  }
  const buffer = await input.blob.arrayBuffer()
  const contentHash = await sha256Hex(buffer)
  const captureId = newCaptureId()
  const completeness: CaptureCompleteness = inspection.completeness
  const asset: CaptureAsset = {
    kind: CAPTURE_ASSET_KIND,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId,
    blobKey: captureId,
    contentHash,
    mimeType: input.blob.type || input.mime.mimeType,
    codec: input.mime.codec,
    durationMs: inspection.durationMs,
    width: inspection.width,
    height: inspection.height,
    rotationDeg: 0,
    captureType: input.captureType,
    completeness,
    intendedDurationMs: input.intendedDurationMs,
    createdAt: input.createdAt ?? new Date().toISOString(),
    hasAudio: false,
    byteLength: input.blob.size,
    filename: `bikefit-${captureId.slice(0, 8)}.${input.mime.extension}`,
  }
  try {
    await input.store.put(asset, input.blob)
  } catch (error) {
    return classifyPersistError(error)
  }
  return { asset, blob: input.blob }
}
