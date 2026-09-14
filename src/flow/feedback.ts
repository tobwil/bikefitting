import type { CameraStatus } from '../types/camera.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { FlowStepId } from './constants.ts'

export type FeedbackTone = 'info' | 'ok' | 'warn' | 'error'

export type FlowFeedback = {
  id: string
  tone: FeedbackTone
  title: string
  detail?: string
  retryLabel?: string
}

export type FlowFeedbackInput = {
  step: FlowStepId
  camera: CameraStatus
  personVisible: boolean
  pedalStatus: PedalSample['status']
  workerError: string | null
}

export function personIsVisible(frame: { landmarks: unknown[] } | null, nearSide: string): boolean {
  return Boolean(frame && frame.landmarks.length > 0 && nearSide !== '—')
}

export function flowFeedback(input: FlowFeedbackInput): FlowFeedback {
  const { step, camera, personVisible, pedalStatus, workerError } = input

  if (camera.permission === 'prompting') {
    return { id: 'opening', tone: 'info', title: 'Kamera wird geöffnet' }
  }

  if (
    camera.error ||
    camera.permission === 'denied' ||
    camera.permission === 'unavailable' ||
    camera.permission === 'error'
  ) {
    return {
      id: 'camera-error',
      tone: 'error',
      title: camera.error ?? 'Kamera konnte nicht geöffnet werden.',
      retryLabel: 'Kamera neu verbinden',
    }
  }

  if (workerError) {
    return {
      id: 'pose-error',
      tone: 'error',
      title: 'Personenerkennung ist fehlgeschlagen.',
      detail: 'Personenerkennung neu starten. Die Kamera bleibt ohne Mikrofon.',
      retryLabel: 'Personenerkennung neu starten',
    }
  }

  const live = camera.permission === 'granted'
  const pedalStep = step === 'body' || step === 'measure' || step === 'calibrate'

  if (live && personVisible && pedalStep && (pedalStatus === 'idle' || pedalStatus === 'lost')) {
    return {
      id: 'pick-pedal',
      tone: pedalStatus === 'lost' ? 'warn' : 'info',
      title: 'Pedalmarker auswählen',
      detail:
        pedalStatus === 'lost'
          ? 'Der Marker ist verloren. Pedalmarker neu wählen — nicht die Kamera neu starten.'
          : 'Sobald die Person erkannt ist: den hellen Kontrastpunkt am Pedal ins Bild holen.',
      retryLabel: pedalStatus === 'lost' ? 'Pedalmarker neu wählen' : undefined,
    }
  }

  if (live && personVisible) {
    return { id: 'person', tone: 'ok', title: 'Person erkannt' }
  }

  if (live && camera.source === 'file') {
    return {
      id: 'file-ready',
      tone: 'ok',
      title: camera.error ? camera.error : 'Lokale Datei geladen',
      detail: 'Bleibt auf diesem Gerät. Kein Upload.',
    }
  }

  if (live && camera.source === 'camera') {
    return {
      id: 'wait-person',
      tone: 'info',
      title: 'Keine Person erkannt',
      detail: 'Fahrer in die Seitenansicht stellen. Die Erkennung läuft weiter.',
    }
  }

  if (step === 'camera' && (camera.permission === 'idle' || camera.permission === 'stopped')) {
    return {
      id: 'ready',
      tone: 'info',
      title:
        camera.source === 'file'
          ? 'Lokale Datei wählen — kein Upload.'
          : 'Kamera starten, wenn die Seitenansicht steht.',
    }
  }

  return { id: 'idle', tone: 'info', title: 'Seitenansicht vorbereiten.' }
}
