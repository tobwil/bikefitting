import type { CameraStartRequest } from '../types/camera.ts'

export function videoOnlyConstraints(deviceId?: string): CameraStartRequest & {
  video: MediaTrackConstraints | true
} {
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  }
  if (deviceId) {
    video.deviceId = { exact: deviceId }
  }

  return { audio: false, video, deviceId }
}

export function isOverconstrained(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'OverconstrainedError' ||
      error.name === 'ConstraintNotSatisfiedError')
  )
}

export function stripAudioTracks(stream: MediaStream): void {
  for (const track of stream.getAudioTracks()) {
    track.stop()
    stream.removeTrack(track)
  }
}

export async function requestVideoOnlyStream(
  deviceId?: string,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException(
      'Camera access needs a secure context (https or localhost) and getUserMedia.',
      'NotSupportedError',
    )
  }

  const request = async (video: MediaTrackConstraints | true) => {
    const constraints: MediaStreamConstraints = { audio: false, video }
    if (constraints.audio !== false) {
      throw new Error('Refusing to call getUserMedia with audio enabled.')
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    stripAudioTracks(stream)
    return stream
  }

  const { video } = videoOnlyConstraints(deviceId)
  try {
    return await request(video)
  } catch (error) {
    if (!deviceId && isOverconstrained(error)) {
      return await request(true)
    }
    throw error
  }
}
