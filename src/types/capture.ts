/** Beginner capture contract (AP-02). Object URLs are never durable identity. */

export const CAPTURE_ASSET_KIND = 'bikefit.capture' as const
export const CAPTURE_SCHEMA_VERSION = 1 as const

export const CAPTURE_PHASES = [
  'idle',
  'preparing',
  'countdown',
  'recording',
  'finalizing',
  'saved',
  'cancelled',
  'failed',
] as const

export type CapturePhase = (typeof CAPTURE_PHASES)[number]

export const CAPTURE_TYPES = ['continuity', 'webcam', 'phone_import', 'file_import'] as const
export type CaptureType = (typeof CAPTURE_TYPES)[number]

export const CAPTURE_COMPLETENESS = ['complete', 'incomplete'] as const
export type CaptureCompleteness = (typeof CAPTURE_COMPLETENESS)[number]

export type CaptureAsset = {
  kind: typeof CAPTURE_ASSET_KIND
  schemaVersion: typeof CAPTURE_SCHEMA_VERSION
  captureId: string
  blobKey: string
  contentHash: string
  mimeType: string
  codec: string | null
  durationMs: number
  width: number
  height: number
  rotationDeg: 0 | 90 | 180 | 270
  captureType: CaptureType
  completeness: CaptureCompleteness
  intendedDurationMs: number
  createdAt: string
  hasAudio: false
  byteLength: number
  filename: string
}

export type CaptureErrorCode =
  | 'camera_missing'
  | 'quota'
  | 'not_playable'
  | 'too_short'
  | 'recorder_unsupported'
  | 'permission'
  | 'unknown'

export type CaptureError = {
  code: CaptureErrorCode
  message: string
}

export type CaptureListItem = {
  captureId: string
  createdAt: string
  durationMs: number
  completeness: CaptureCompleteness
  captureType: CaptureType
  filename: string
  byteLength: number
}
