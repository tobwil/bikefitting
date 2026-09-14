import { REPEATABILITY_BAND_DEG } from '../types/change.ts'

const EXACT_MM = /\d+(?:[.,]\d+)?\s*mm\b/i
const IMPROVED = /verbessert|besser\b/i
const EXAKT_SATTEL = /sattel\s+exakt/i

export class ChangeCopyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChangeCopyError'
  }
}

export function assertSafeChangeCopy(text: string, field = 'copy'): void {
  if (EXACT_MM.test(text) || EXAKT_SATTEL.test(text)) {
    throw new ChangeCopyError(`${field} must not guess millimetres`)
  }
  if (IMPROVED.test(text)) {
    throw new ChangeCopyError(`${field} must not claim improvement (verbessert/besser)`)
  }
}

export const CHANGE_COPY = {
  documentTitle: 'Änderung dokumentieren',
  documentHintAdjust: 'Nur die Richtung dieser Sitzänderung — keine Millimeter.',
  documentHintUser:
    'Eigene Änderung notieren. Das ist keine Sitzeinstellung durch die App.',
  directionHigher: 'Sattel höher',
  directionLower: 'Sattel tiefer',
  noteOldLabel: 'Notiz vorher (optional)',
  noteNewLabel: 'Notiz nachher (optional)',
  recapture: 'Erneut aufnehmen und vergleichen',
  recaptureHint: 'Dieselbe Kamera und denselben Ausschnitt verwenden.',
  recaptureBanner:
    'Vergleichsaufnahme: dieselbe Kamera und denselben Ausschnitt wie zuvor. Ein Kamera- oder Linsenwechsel zählt nicht als Körperveränderung.',
  cancel: 'Zurück zum Ergebnis',
  notComparable: 'Nicht vergleichbar',
  noSecureChange: 'Keine sichere Veränderung messbar',
  measurableDelta: 'Beobachtete Differenz — gleiche Methode',
  targetBandReached:
    'Der Wert liegt im Zielband. Das ist keine Aussage über Komfort oder Verletzungsfreiheit.',
  targetBandMissed: 'Der Wert liegt außerhalb des Zielbands. Das ist keine Verletzungs- oder Komfortaussage.',
  sameMethod: 'Dieselbe Metrik und dieselbe Methode.',
  cameraNotBody: 'Kamera- oder Linsenwechsel ist keine Körperveränderung.',
  repeatabilityNote: `Wiederholbarkeit vorab: ±${REPEATABILITY_BAND_DEG}° bei unverändertem Setup (AP-09-Gate, keine klinische Genauigkeit).`,
} as const

for (const [key, text] of Object.entries(CHANGE_COPY)) {
  assertSafeChangeCopy(text, `CHANGE_COPY.${key}`)
}

export function directionLabel(direction: 'higher' | 'lower'): string {
  return direction === 'higher' ? CHANGE_COPY.directionHigher : CHANGE_COPY.directionLower
}
