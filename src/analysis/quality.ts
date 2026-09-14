import type { ActionDecisionInput } from '../types/action.ts'
import type { MarkerlessReport } from '../types/analysis.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'

function notesFrom(report: MarkerlessReport): string[] {
  const notes: string[] = []
  const reasons = report.knee.reasons
  if (reasons.includes('missing_knee')) notes.push('Hüfte, Knie oder Knöchel derselben Seite fehlen.')
  if (reasons.includes('not_pedaling') || reasons.includes('still')) {
    notes.push('Kein durchgehendes Treten erkannt (Stillstand oder unregelmäßige Bewegung).')
  }
  if (reasons.includes('mount_dismount')) notes.push('Auf- oder Abstieg, nicht der Tretabschnitt.')
  if (reasons.includes('too_few_cycles')) {
    notes.push(`Zu wenige vollständige Tretzyklen (${report.usableCycles} von mindestens 10).`)
  }
  if (reasons.includes('insufficient_extension_coverage')) {
    notes.push('Streckphase in zu vielen Zyklen lückenhaft — Zyklus ausgeschlossen, nicht interpoliert.')
  }
  if (reasons.includes('side_switch')) notes.push('Körperseite hat gewechselt — keine gemischte Kette.')
  if (reasons.includes('visibility')) notes.push('Gelenke zeitweise nicht sichtbar.')
  if (notes.length === 0 && report.knee.quality !== 'ok') notes.push('Kniebeobachtung nicht auswertbar.')
  return notes
}

/**
 * Map a markerless report to ActionDecision input.
 * Never supplies a BDC rule profile for `max_extension`.
 */
export function actionInputFromMarkerless(
  report: MarkerlessReport,
  ids: { captureId: string | null; analysisId: string | null; evidenceIds?: string[] },
): ActionDecisionInput {
  const present = report.knee.quality === 'ok' && report.knee.degrees != null
  return {
    captureId: ids.captureId,
    analysisId: ids.analysisId,
    audience: 'beginner',
    method: report.method,
    metric: 'knee_flexion',
    valueDeg: present ? report.knee.degrees!.median : null,
    uncertaintyDeg: present ? report.knee.degrees!.spread : null,
    cycles: report.knee.usableCycles,
    kneePresent: present,
    qualityLevel: report.qualityLevel,
    profile: matchingRuleProfile('knee_flexion', report.method),
    urlProductionFlag: false,
    lensStatus: 'unknown',
    contradiction: false,
    painReported: false,
    supportedContext: true,
    evidenceIds: ids.evidenceIds ?? report.evidence.map((item) => item.id),
  }
}

export function qualityNotesFromMarkerless(report: MarkerlessReport): string[] {
  return notesFrom(report)
}

export function qualityLevelFromKnee(ok: boolean, usableCycles: number, minValidCycles: number): MarkerlessReport['qualityLevel'] {
  if (!ok) return 'insufficient'
  if (usableCycles < minValidCycles) return 'insufficient'
  return 'ok'
}
