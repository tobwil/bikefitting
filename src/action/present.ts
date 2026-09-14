import type { ActionDecision } from '../types/action.ts'
import { COPY, assertSafeActionTemplate, fillCopy, formatReportNumber, methodLabel } from './copy.ts'
import { decideAction } from './decide.ts'
import { isReleasedProfile } from './release.ts'
import { matchingRuleProfile, getRuleProfile } from '../rules/catalog.ts'
import type { MeasurementResult } from '../types/result.ts'
import { readKneeObservation } from './observation.ts'

function cloneDecision(decision: ActionDecision): ActionDecision {
  return {
    ...decision,
    evidenceIds: [...decision.evidenceIds],
    blockReasons: [...decision.blockReasons],
    template: { ...decision.template },
    report: { ...decision.report },
  }
}

function filledUnreleased(decision: ActionDecision) {
  const vars = {
    valueDeg: formatReportNumber(decision.report.valueDeg),
    methodLabel: methodLabel(decision.method),
    ruleId: decision.ruleId ?? '—',
    releaseStatus: decision.releaseStatus,
    cycles: formatReportNumber(decision.report.cycles),
    targetDeg: '—',
    lowBound: '—',
    highBound: '—',
  }
  const base = decision.report.valueDeg != null ? COPY.reviewUnreleased : COPY.reviewUnreleasedNoValue
  const template = {
    what: fillCopy(base.what, vars),
    why: fillCopy(base.why, vars),
    how: fillCopy(base.how, vars),
  }
  assertSafeActionTemplate(template)
  return template
}

/**
 * Display-time clamp. Stored `kind: adjust` is ignored unless the catalog
 * profile is actually released. Never retroactively fakes Freigabe.
 */
export function presentActionDecision(decision: ActionDecision): ActionDecision {
  const next = cloneDecision(decision)
  const profile = next.ruleId ? getRuleProfile(next.ruleId) : null
  const releasedNow = isReleasedProfile(profile)
  if (next.kind === 'adjust' && !releasedNow) {
    next.kind = 'review'
    next.released = false
    next.productionEnabled = profile?.productionEnabled === true
    next.parameter = null
    next.direction = null
    if (!next.blockReasons.includes('profile_unreleased')) {
      next.blockReasons = [...next.blockReasons, 'profile_unreleased']
    }
    next.template = filledUnreleased(next)
    next.report = {
      ...next.report,
      targetDeg: null,
      lowBoundDeg: null,
      highBoundDeg: null,
    }
  }
  if (next.kind !== 'adjust') {
    next.parameter = null
    next.direction = null
  }
  return next
}

export function actionFromMeasurementResult(result: MeasurementResult): ActionDecision {
  if (result.actionDecision) return presentActionDecision(result.actionDecision)
  const knee = readKneeObservation({ cards: result.metrics, report: null })
  const method = knee.method ?? result.metrics.find((item) => item.method)?.method ?? null
  const version = result.ruleVersions.find((item) => !method || item.method === method)
  const profile =
    (version ? getRuleProfile(version.id) : null) ?? matchingRuleProfile('knee_flexion', method)
  const evidenceIds =
    result.phaseEvidence?.slots
      .filter((slot) => slot.status === 'captured')
      .map((slot) => `phase:${slot.id}`) ?? []
  return decideAction({
    captureId: result.quality.measurementId ?? result.id,
    analysisId: result.id,
    audience: 'beginner',
    method,
    metric: 'knee_flexion',
    valueDeg: knee.valueDeg,
    uncertaintyDeg: knee.uncertaintyDeg,
    cycles: knee.cycles,
    kneePresent: knee.kneePresent,
    qualityLevel: result.quality.level,
    profile,
    urlProductionFlag: result.profile.productionEnabled,
    lensStatus: 'unknown',
    contradiction: false,
    painReported: false,
    supportedContext: true,
    evidenceIds,
  })
}
