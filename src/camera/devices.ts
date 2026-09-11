import type { CameraDevice } from '../types/camera.ts'

export async function listVideoDevices(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []

  try {
    const all = await navigator.mediaDevices.enumerateDevices()
    return all
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label.trim() || `Camera ${index + 1}`,
      }))
  } catch {
    return []
  }
}

export function deviceIdFromStream(
  stream: MediaStream,
  fallback?: string,
): string | null {
  const track = stream.getVideoTracks()[0]
  const id = track?.getSettings().deviceId
  return id || fallback || null
}
