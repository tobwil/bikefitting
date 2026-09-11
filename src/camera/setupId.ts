import type { CameraStatus, VideoSourceKind } from '../types/camera.ts'

export type CameraGeometry = {
  source: VideoSourceKind
  deviceId: string | null
  width: number
  height: number
}

/** Stable id for the current camera + pixel geometry. Changes invalidate calibration. */
export function makeSetupId(input: CameraGeometry): string {
  const device =
    input.source === 'synthetic' ? 'synthetic' : (input.deviceId?.trim() || 'default')
  return `${input.source}:${device}:${Math.round(input.width)}x${Math.round(input.height)}`
}

export function geometryFromStatus(
  status: Pick<CameraStatus, 'source' | 'deviceId'>,
  width: number,
  height: number,
): CameraGeometry {
  return {
    source: status.source,
    deviceId: status.source === 'synthetic' ? null : status.deviceId,
    width,
    height,
  }
}

export function setupIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && a === b
}
