export type CameraZoom = {
  min: number
  max: number
  step: number
  current: number | null
}

type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } }
type ZoomSettings = MediaTrackSettings & { zoom?: number }

export function cameraZoom(track: MediaStreamTrack | null): CameraZoom | null {
  if (!track || typeof track.getCapabilities !== 'function') return null
  try {
    const range = (track.getCapabilities() as ZoomCapabilities).zoom
    if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max <= range.min) return null
    const setting = (track.getSettings() as ZoomSettings).zoom
    return {
      min: range.min,
      max: range.max,
      step: range.step && range.step > 0 ? range.step : 0.1,
      current: typeof setting === 'number' && Number.isFinite(setting) ? setting : null,
    }
  } catch {
    return null
  }
}

export type ApplyCameraZoomResult = {
  status: 'applied' | 'rejected' | 'unconfirmed'
  zoom: number | null
  geometryChanged: boolean
  message?: string
}

export async function tryApplyCameraZoom(track: MediaStreamTrack, value: number): Promise<ApplyCameraZoomResult> {
  const zoom = cameraZoom(track)
  if (!zoom || !Number.isFinite(value) || value < zoom.min || value > zoom.max) {
    return {
      status: 'rejected',
      zoom: zoom?.current ?? null,
      geometryChanged: false,
      message: 'Diese Zoomstufe wird von der Kamera im Browser nicht angeboten.',
    }
  }
  try {
    // TypeScript's DOM types omit the Image Capture PTZ extension used by Chrome.
    await track.applyConstraints({ advanced: [{ zoom: value }] } as unknown as MediaTrackConstraints)
  } catch (cause) {
    return {
      status: 'unconfirmed',
      zoom: cameraZoom(track)?.current ?? zoom.current,
      geometryChanged: true,
      message: cause instanceof Error ? cause.message : 'Der Browser hat die Zoomstufe nicht übernommen.',
    }
  }
  const actual = (track.getSettings() as ZoomSettings).zoom
  if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - value) > Math.max(zoom.step, 0.05)) {
    return {
      status: 'unconfirmed',
      zoom: typeof actual === 'number' && Number.isFinite(actual) ? actual : cameraZoom(track)?.current ?? null,
      geometryChanged: true,
      message: 'Der Browser hat die Zoomstufe nicht übernommen.',
    }
  }
  return { status: 'applied', zoom: actual, geometryChanged: true }
}

export async function applyCameraZoom(track: MediaStreamTrack, value: number): Promise<number> {
  const result = await tryApplyCameraZoom(track, value)
  if (result.status === 'applied' && result.zoom != null) return result.zoom
  throw new Error(result.message ?? 'Zoom konnte nicht geändert werden.')
}
