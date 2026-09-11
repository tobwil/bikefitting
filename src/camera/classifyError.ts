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
        'Chrome hat die Kamera blockiert. Schloss in der Adresszeile → Website-Einstellungen → Kamera → Zulassen, dann erneut versuchen.',
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      permission: 'unavailable',
      error:
        'Keine Kamera gefunden. Webcam anschließen oder andere Apps schließen, dann erneut versuchen.',
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
        'Die Kamera ist belegt oder lässt sich nicht öffnen. Andere Apps schließen, dann erneut versuchen.',
    }
  }

  if (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError'
  ) {
    return {
      permission: 'error',
      error:
        'Diese Kamera kann die gewünschten Einstellungen nicht erfüllen. Anderes Gerät wählen oder erneut versuchen.',
    }
  }

  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return {
      permission: 'unavailable',
      error:
        'Kamerazugriff braucht eine sichere Seite (https oder localhost) und einen Browser mit getUserMedia.',
    }
  }

  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : 'Kamera konnte nicht geöffnet werden.'

  return { permission: 'error', error: message }
}
