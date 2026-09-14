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

export async function applyCameraZoom(track: MediaStreamTrack, value: number): Promise<number> {
  const zoom = cameraZoom(track)
  if (!zoom || !Number.isFinite(value) || value < zoom.min || value > zoom.max) {
    throw new Error('Diese Zoomstufe wird von der Kamera im Browser nicht angeboten.')
  }
  // TypeScript's DOM types omit the Image Capture PTZ extension used by Chrome.
  await track.applyConstraints({ advanced: [{ zoom: value }] } as unknown as MediaTrackConstraints)
  const actual = (track.getSettings() as ZoomSettings).zoom
  if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - value) > Math.max(zoom.step, 0.05)) {
    throw new Error('Der Browser hat die Zoomstufe nicht übernommen.')
  }
  return actual
}
