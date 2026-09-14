import type { CameraStatus, VideoSourceKind } from '../types/camera.ts'

export type CameraGeometry = {
  source: VideoSourceKind
  deviceId: string | null
  width: number
  height: number
  /**
   * Explicit view revision. Zoom, crop, rotation, or a user-confirmed framing
   * change bump this even when source and pixel size stay the same.
   */
  geometryRevision?: number
}

export function geometryRevisionOf(input: { geometryRevision?: number } | null | undefined): number {
  const raw = input?.geometryRevision
  if (raw == null || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.trunc(raw))
}

/** Stable id for the current camera + pixel geometry. Changes invalidate calibration. */
export function makeSetupId(input: CameraGeometry): string {
  const device =
    input.source === 'synthetic' ? 'synthetic' : input.source === 'file' ? fileDevice(input.deviceId) : (input.deviceId?.trim() || 'default')
  const base = `${input.source}:${device}:${Math.round(input.width)}x${Math.round(input.height)}`
  const revision = geometryRevisionOf(input)
  return revision > 0 ? `${base}:r${revision}` : base
}

function fileDevice(deviceId: string | null): string {
  const raw = (deviceId ?? 'local').trim() || 'local'
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 48)
}

export function geometryFromStatus(
  status: Pick<CameraStatus, 'source' | 'deviceId'>,
  width: number,
  height: number,
  geometryRevision = 0,
): CameraGeometry {
  return {
    source: status.source,
    deviceId: status.source === 'synthetic' ? null : status.deviceId,
    width,
    height,
    geometryRevision: geometryRevisionOf({ geometryRevision }),
  }
}

export function setupIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && a === b
}
