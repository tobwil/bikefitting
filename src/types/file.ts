export type FileMediaKind = 'video' | 'image'

export type RotationDeg = 0 | 90 | 180 | 270

/** Axis-aligned crop in the rotated frame, normalized 0–1. */
export type NormRect = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Explicit source transform. Pose/calib/metrics see the working frame;
 * stored points are mapped back to the original file pixels.
 */
export type SourceTransform = {
  rotation: RotationDeg
  crop: NormRect | null
}

export const IDENTITY_SOURCE_TRANSFORM: SourceTransform = {
  rotation: 0,
  crop: null,
}

export type LocalFileMeta = {
  kind: FileMediaKind
  name: string
  mimeType: string
  sizeBytes: number
  objectUrl: string | null
  width: number
  height: number
  durationMs: number | null
  staticCheck: boolean
}

export type FilePlaybackSnapshot = {
  paused: boolean
  ended: boolean
  currentTimeMs: number
  durationMs: number
}

export type SeekKind = 'none' | 'forward' | 'backward'
