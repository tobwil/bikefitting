import type { AnalysisErrorCode, AnalysisPhase } from '../types/analysis.ts'

export const EVALUATING_LABEL = 'Aufnahme wird ausgewertet'
export const RETRY_ANALYSIS_LABEL = 'Analyse erneut versuchen'
export const NEW_RECORDING_LABEL = 'Neue Aufnahme'
export const ANALYZED_LABEL = 'Clip ausgewertet'
export const NO_PEDALING_LABEL = 'Kein durchgehendes Treten erkannt'
export const METRICS_PENDING_LABEL =
  'Die Kniebeobachtung folgt, sobald die Messmethode bereit ist. Keine Sitzeinstellung aus diesem Schritt.'
export const DOWNLOAD_CLIP_LABEL = 'Clip herunterladen'

export const ANALYSIS_STAGE_COPY: Record<AnalysisPhase, string> = {
  queued: 'Auftrag wartet',
  decoding: 'Video wird gelesen',
  pose: 'Körperpunkte',
  selecting_segment: 'Tretabschnitt',
  measuring: 'Messwerte',
  done: 'Fertig',
  cancelled: 'Abgebrochen',
  failed: 'Nicht ausgewertet',
}

export const ANALYSIS_ERROR_COPY: Record<AnalysisErrorCode, string> = {
  decode: 'Das gespeicherte Video lässt sich nicht lesen. Dieselbe Datei erneut auswerten oder neu aufnehmen.',
  decode_stuck:
    'Der Player liefert keine neuen Bilderzeiten. Dieselbe Aufnahme erneut auswerten — die Kamera bleibt unberührt.',
  pose: 'Die Körpererkennung ist fehlgeschlagen. Dieselbe gespeicherte Aufnahme erneut auswerten.',
  cancelled: 'Die Auswertung wurde abgebrochen. Der Clip bleibt gespeichert.',
  store_missing: 'Der gespeicherte Clip wurde nicht gefunden. Bitte die Aufnahme in der Liste öffnen.',
  hash_mismatch: 'Die gespeicherten Bytes passen nicht mehr zum Auftrag. Bitte den Clip erneut öffnen.',
  unknown: 'Die Auswertung ist fehlgeschlagen. Dieselbe Aufnahme erneut versuchen — nicht neu filmen.',
}

export function framesProgressCopy(posed: number, planned: number): string {
  if (planned <= 0) return 'Noch keine Bilder geplant'
  return `${posed} von ${planned} Bildern`
}

export function selectedSpanCopy(startMs: number, endMs: number): string {
  const start = (startMs / 1000).toFixed(1)
  const end = (endMs / 1000).toFixed(1)
  return `Genutzt: ${start}–${end} s Treten (Auf- und Absteigen sowie Stillstand getrennt).`
}
