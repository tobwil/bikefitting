import type { CaptureErrorCode } from '../types/capture.ts'

export const START_PRIMARY_LABEL = 'BikeFit starten'
export const START_PRIMARY_SUB =
  'iPhone als Kamera am Mac. 40 Sekunden aufnehmen, ohne Mikrofon. Keine Marker.'
export const START_SECONDARY_FILE = 'Vorhandenes Video'
export const START_SECONDARY_CAPTURES = 'Frühere Ergebnisse'
export const START_EXPERT_LABEL = 'Erweiterte Messung'
export const START_DEMO_LABEL = 'Demo'

export const RECORD_PRIMARY_LABEL = '40 Sekunden aufnehmen'
export const RECORD_PRIMARY_SUB = 'Startet nach 10 Sekunden · endet automatisch · ohne Mikrofon'
export const RECORD_RUNNING_LABEL = 'Aufnahme läuft'
export const SAVED_LABEL = 'Gespeichert'
export const INCOMPLETE_LABEL = 'Unvollständig'
export const CORRECT_FRAMING_LABEL = 'Ausschnitt korrigieren'
export const RECORD_ANYWAY_LABEL = 'Trotzdem aufnehmen'
export const RECORD_ANYWAY_EXPLAIN =
  'Die Aufnahme wird gespeichert. Fehlt die Beinlinie, kann die spätere Auswertung scheitern — dann neu aufnehmen.'
export const CONNECTED_LABEL = 'Verbunden'
export const CONNECTING_LABEL = 'Warte auf Bild…'

export const CAPTURE_ERROR_COPY: Record<CaptureErrorCode, string> = {
  camera_missing:
    'Die Kamera ist nicht mehr da. iPhone nah am Mac lassen, Continuity Camera einschalten oder per USB verbinden, dann erneut aufnehmen.',
  quota:
    'Der Speicher dieses Macs ist voll. Andere Dateien löschen oder einen gespeicherten Clip herunterladen und entfernen, dann erneut versuchen.',
  not_playable:
    'Der Clip lässt sich nicht abspielen. Bitte erneut aufnehmen — unlesbare Dateien gelten nicht als gespeichert.',
  too_short: 'Die Aufnahme ist zu kurz. Bitte den 40-Sekunden-Durchlauf erneut starten.',
  recorder_unsupported:
    'Dieser Browser kann die Kamera nicht als Video speichern. Chrome auf dem Mac verwenden.',
  permission:
    'Chrome hat die Kamera blockiert. Schloss in der Adresszeile → Kamera zulassen, dann BikeFit starten.',
  unknown: 'Die Aufnahme konnte nicht gespeichert werden. Bitte erneut versuchen.',
}

export function savedUiLabel(input: {
  persisted: boolean
  decoded: boolean
  completeness: 'complete' | 'incomplete' | null
}): typeof SAVED_LABEL | typeof INCOMPLETE_LABEL | null {
  if (!input.persisted || !input.decoded || !input.completeness) return null
  if (input.completeness === 'complete') return SAVED_LABEL
  return INCOMPLETE_LABEL
}
