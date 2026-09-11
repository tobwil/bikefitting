import type { CameraPermission } from '../types/camera.ts'

export type ClassifiedCameraError = {
  permission: Extract<CameraPermission, 'denied' | 'unavailable' | 'error'>
  error: string
}

export function classifyCameraError(error: unknown): ClassifiedCameraError {
  const name = error instanceof DOMException ? error.name : ''

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      permission: 'denied',
      error:
        'Chrome blocked the camera. Click the lock icon in the address bar → Site settings → Camera → Allow, then Restart.',
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      permission: 'unavailable',
      error:
        'No camera is available. Connect a webcam or close other apps using it, then Restart.',
    }
  }

  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError'
  ) {
    return {
      permission: 'unavailable',
      error:
        'The camera is busy or cannot be opened. Close other apps using it, then Restart.',
    }
  }

  if (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError'
  ) {
    return {
      permission: 'error',
      error:
        'That camera cannot satisfy the requested settings. Pick another device or Restart.',
    }
  }

  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return {
      permission: 'unavailable',
      error:
        'Camera access needs a secure context (https or localhost) and a browser that supports getUserMedia.',
    }
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Camera request failed.'

  return { permission: 'error', error: message }
}
