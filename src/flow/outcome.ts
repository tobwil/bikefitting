import { decideAction } from '../action/decide.ts'
import { presentActionDecision } from '../action/present.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'
import type { ActionDecision, ActionKind } from '../types/action.ts'
import { ACTION_DECISION_KIND, ACTION_DECISION_SCHEMA_VERSION } from '../types/action.ts'
import type { ObservationReport } from '../types/observation.ts'
import { formatReportNumber, methodLabel } from '../action/copy.ts'
import { fillOutcomeTemplate, OUTCOME_COPY, type OutcomeCopyVars } from './outcomeCopy.ts'
import { releaseStatusOf } from '../action/release.ts'
import { isKnownActionMethod } from '../action/observation.ts'

/** Briefing table: one primary product action per ActionDecision kind. */
export const OUTCOME_PRIMARY = {
  adjust: {
    code: 'save' as const,
    label: 'Lokal speichern',
    hint: 'Vorher-Stand sichern, bevor etwas geändert wird.',
  },
  keep: {
    code: 'save' as const,
    label: 'Lokal speichern',
    hint: 'Beobachtung auf diesem Gerät behalten.',
  },
  retake: {
    code: 'retake' as const,
    label: 'Neu aufnehmen',
    hint: 'Neue Aufnahme — ein anderes Video.',
  },
  review: {
    code: 'reanalyze' as const,
    label: 'Gespeichertes Video erneut auswerten',
    hint: 'Derselbe Clip, neuer Analyseauftrag.',
  },
} satisfies Record<ActionKind, { code: 'save' | 'retake' | 'reanalyze'; label: string; hint: string }>

export type OutcomePrimaryCode = (typeof OUTCOME_PRIMARY)[ActionKind]['code'] | 'home' | 'remeasure'

export type OutcomePrimaryAction = {
  kind: ActionKind
  code: OutcomePrimaryCode
  label: string
  hint: string
}

export type OutcomeWhy = {
  metrics: string
  method: string
  evidence: string
  limits: string
  reasonText: string
}

export type OutcomeView = {
  kind: ActionKind
  title: string
  what: string
  why: OutcomeWhy
  how: string
  primary: OutcomePrimaryAction
  released: boolean
  seatDirection: 'higher' | 'lower' | 'none'
  captureId: string
  analysisId: string
  method: string | null
  methodVersion: string | null
  evidenceRefs: string[]
  stub: boolean
  observationStatus: ObservationReport['status'] | null
  action: ActionDecision
}

function copyVars(observation: ObservationReport): OutcomeCopyVars {
  const knee = kneeMetric(observation)
  return {
    valueDeg: formatReportNumber(knee?.value ?? null),
    methodLabel: methodLabel(observation.method ?? knee?.method),
    ruleId: '—',
    releaseStatus: 'missing',
    cycles: formatReportNumber(knee?.usableCycles ?? 0),
    targetDeg: '—',
    lowBound: '—',
    highBound: '—',
    reasonText: observation.reasonText,
  }
}

export function kneeMetric(observation: ObservationReport) {
  return observation.metrics.find((item) => item.id === 'knee_flexion' || item.id === 'kneeFlexion')
}

export function coreKneeAvailable(observation: ObservationReport): boolean {
  const knee = kneeMetric(observation)
  return Boolean(knee?.available && knee.value != null && Number.isFinite(knee.value))
}

function analysisDecision(
  observation: ObservationReport,
  kind: ActionKind,
  template: ReturnType<typeof fillOutcomeTemplate>,
  blockReasons: ActionDecision['blockReasons'],
): ActionDecision {
  const knee = kneeMetric(observation)
  return {
    schemaVersion: ACTION_DECISION_SCHEMA_VERSION,
    type: ACTION_DECISION_KIND,
    kind,
    captureId: observation.captureId,
    analysisId: observation.analysisId,
    ruleId: null,
    ruleVersion: null,
    method: observation.method,
    releaseStatus: 'missing',
    released: false,
    productionEnabled: false,
    evidenceIds: evidenceRefsOf(observation),
    parameter: null,
    direction: null,
    template,
    blockReasons,
    audience: 'beginner',
    report: {
      valueDeg: coreKneeAvailable(observation) ? (knee?.value ?? null) : null,
      uncertaintyDeg: knee?.spread ?? null,
      cycles: knee?.usableCycles ?? 0,
      targetDeg: null,
      lowBoundDeg: null,
      highBoundDeg: null,
    },
  }
}

export function evidenceRefsOf(observation: ObservationReport): string[] {
  const ids = new Set<string>()
  ids.add(`capture:${observation.captureId}`)
  ids.add(`analysis:${observation.analysisId}`)
  for (const item of observation.evidence) ids.add(item.id)
  for (const metric of observation.metrics) {
    for (const id of metric.evidenceIds) ids.add(id)
  }
  return [...ids]
}

/**
 * Map an observation (real or stub) onto ActionDecision.
 * AP-10 seat gates stay in decideAction for usable metrics.
 * Stub/failed/incomplete never become adjust/keep with a soothing number.
 */
export function decideFromObservation(observation: ObservationReport): ActionDecision {
  const vars = copyVars(observation)
  const reasons = observation.reasons
  if (observation.stub) {
    if (reasons.includes('capture_incomplete')) {
      return analysisDecision(
        observation,
        'retake',
        fillOutcomeTemplate(OUTCOME_COPY.retakeIncompleteCapture, vars),
        ['quality_insufficient', 'unsupported_method'],
      )
    }
    if (observation.status === 'failed' || reasons.includes('analysis_failed') || reasons.includes('decoder_failed')) {
      return analysisDecision(
        observation,
        'review',
        fillOutcomeTemplate(OUTCOME_COPY.reviewFailed, vars),
        ['quality_insufficient', 'unsupported_method'],
      )
    }
    return analysisDecision(
      observation,
      'review',
      fillOutcomeTemplate(OUTCOME_COPY.reviewStub, vars),
      ['unsupported_method', 'markerless_not_released'],
    )
  }

  if (observation.status === 'failed' || reasons.includes('analysis_failed') || reasons.includes('decoder_failed')) {
    return analysisDecision(
      observation,
      'review',
      fillOutcomeTemplate(OUTCOME_COPY.reviewFailed, vars),
      ['quality_insufficient'],
    )
  }

  if (reasons.includes('capture_incomplete')) {
    return analysisDecision(
      observation,
      'retake',
      fillOutcomeTemplate(OUTCOME_COPY.retakeIncompleteCapture, vars),
      ['quality_insufficient'],
    )
  }

  if (observation.status === 'incomplete' || reasons.includes('analysis_incomplete') || reasons.includes('method_not_available')) {
    return analysisDecision(
      observation,
      'review',
      fillOutcomeTemplate(OUTCOME_COPY.reviewIncomplete, vars),
      ['unsupported_method', 'markerless_not_released'],
    )
  }

  const knee = kneeMetric(observation)
  const method = observation.method ?? knee?.method ?? null
  const profile = matchingRuleProfile('knee_flexion', method)
  const qualityLevel =
    observation.status === 'usable' && coreKneeAvailable(observation)
      ? 'ok'
      : observation.status === 'partial'
        ? 'borderline'
        : 'insufficient'

  if (!coreKneeAvailable(observation)) {
    return analysisDecision(
      observation,
      'retake',
      fillOutcomeTemplate(OUTCOME_COPY.retakeMissingCore, vars),
      ['missing_knee', 'quality_insufficient'],
    )
  }

  return presentActionDecision(
    decideAction({
      captureId: observation.captureId,
      analysisId: observation.analysisId,
      audience: 'beginner',
      method,
      metric: 'knee_flexion',
      valueDeg: knee?.value ?? null,
      uncertaintyDeg: knee?.spread ?? null,
      cycles: knee?.usableCycles ?? 0,
      kneePresent: true,
      qualityLevel,
      profile,
      urlProductionFlag: false,
      lensStatus: 'unknown',
      contradiction: false,
      painReported: false,
      supportedContext: true,
      evidenceIds: evidenceRefsOf(observation),
    }),
  )
}

export function whyFromObservation(
  observation: ObservationReport | null | undefined,
  action: ActionDecision,
): OutcomeWhy {
  const knee = observation ? kneeMetric(observation) : null
  const value =
    action.report.valueDeg != null ? `${formatReportNumber(action.report.valueDeg)}°` : 'nicht verfügbar'
  const cycles = action.report.cycles != null ? String(action.report.cycles) : '0'
  const methodName = methodLabel(action.method ?? observation?.method)
  const methodVersion = observation?.methodVersion ?? '—'
  const known = isKnownActionMethod(action.method)
  const evidence = action.evidenceIds.length > 0 ? action.evidenceIds.join(', ') : 'keine Beleg-IDs'
  const limits: string[] = []
  if (observation?.stub) limits.push('Auswertung ist ein Platzhalter (AP-05 nicht in diesem Stand).')
  if (!action.released) {
    limits.push(`Regel ${action.ruleId ?? '—'} ist ${releaseStatusOf(null)} / ${action.releaseStatus} — nicht fachlich freigegeben.`)
  }
  if (!known || action.blockReasons.includes('method_mismatch') || action.blockReasons.includes('unsupported_method')) {
    limits.push('Methode und Zielband müssen zusammenpassen. BDC-Bänder gelten nicht für größte Streckung.')
  }
  if (action.blockReasons.includes('unvalidated_lens')) {
    limits.push('Linse/Ausschnitt nicht als geprüft hinterlegt.')
  }
  if (observation?.phaseSource === 'unavailable' || observation?.phaseSource === 'motion_estimate') {
    limits.push('Kein BDC-Wert ohne verifizierte Kurbelphase.')
  }
  if (limits.length === 0) limits.push(action.template.why)
  return {
    metrics: knee
      ? `Knie: ${value}, n=${cycles}, verfügbar=${knee.available ? 'ja' : 'nein'}${knee.reasons.length ? ` (${knee.reasons.join(', ')})` : ''}.`
      : `Knie: ${value}, n=${cycles}.`,
    method: `Methode ${methodName}${observation?.methodVersion ? ` · ${methodVersion}` : ''}.`,
    evidence: `Belege: ${evidence}.`,
    limits: limits.join(' '),
    reasonText: observation?.reasonText ?? action.template.why,
  }
}

export function primaryActionFor(
  kind: ActionKind,
  ctx: { hasCaptureAsset: boolean; expert: boolean },
): OutcomePrimaryAction {
  const row = OUTCOME_PRIMARY[kind]
  if (row.code === 'reanalyze' && !ctx.hasCaptureAsset) {
    return {
      kind,
      code: ctx.expert ? 'remeasure' : 'home',
      label: ctx.expert ? 'Erneut messen' : 'Zur Startseite',
      hint: 'Kein gespeicherter Clip für denselben Analyseauftrag.',
    }
  }
  if (row.code === 'retake' && ctx.expert) {
    return { kind, code: 'remeasure', label: 'Erneut messen', hint: row.hint }
  }
  return { kind, code: row.code, label: row.label, hint: row.hint }
}

export function outcomeView(input: {
  action: ActionDecision
  observation?: ObservationReport | null
  hasCaptureAsset?: boolean
  expert?: boolean
}): OutcomeView {
  const action = presentActionDecision(input.action)
  const observation = input.observation ?? null
  const captureId = action.captureId ?? observation?.captureId ?? '—'
  const analysisId = action.analysisId ?? observation?.analysisId ?? '—'
  const seat =
    action.kind === 'adjust' && action.released && action.parameter === 'seat_height' && action.direction
      ? action.direction
      : 'none'
  return {
    kind: action.kind,
    title: kindTitle(action.kind),
    what: action.template.what,
    why: whyFromObservation(observation, action),
    how: action.template.how,
    primary: primaryActionFor(action.kind, {
      hasCaptureAsset: input.hasCaptureAsset === true,
      expert: input.expert === true,
    }),
    released: action.released,
    seatDirection: seat,
    captureId,
    analysisId,
    method: action.method ?? observation?.method ?? null,
    methodVersion: observation?.methodVersion ?? null,
    evidenceRefs: action.evidenceIds,
    stub: observation?.stub === true,
    observationStatus: observation?.status ?? null,
    action,
  }
}

export function kindTitle(kind: ActionKind): string {
  if (kind === 'adjust') return 'Einstellen'
  if (kind === 'keep') return 'Beibehalten'
  if (kind === 'retake') return 'Neu aufnehmen'
  return 'Prüfen'
}

export function methodsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a === b
}
