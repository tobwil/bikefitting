import {
  METRIC_KEYS,
  type MeasurementSession,
  type SessionComparison,
  type SessionConditions,
  type SessionDeltas,
  type ComparisonRestrictionReason,
  type SessionMetrics,
} from '../types/session.ts'
import type { MeasurementResult } from '../types/result.ts'
import { PHASE_SELECTION_METHOD } from '../types/phase.ts'

export function normalizeBike(bike: string): string {
  return bike.trim().toLowerCase()
}

/** Returns the condition fields that differ (empty → like-for-like). */
export function differingConditions(
  a: SessionConditions,
  b: SessionConditions,
): ComparisonRestrictionReason[] {
  const reasons: ComparisonRestrictionReason[] = []
  if (normalizeBike(a.bike) !== normalizeBike(b.bike)) reasons.push('bike')
  if (a.side !== b.side) reasons.push('side')
  if (a.handPosition !== b.handPosition) reasons.push('handPosition')
  if (a.calibrationVersion !== b.calibrationVersion) reasons.push('calibrationVersion')
  return reasons
}

export function deltaMetric(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null
  return after - before
}

export function diffMetrics(before: SessionMetrics, after: SessionMetrics): SessionDeltas {
  const deltas = {} as SessionDeltas
  for (const key of METRIC_KEYS) {
    if (key === 'pedalRevolutions') {
      deltas[key] = after[key] - before[key]
    } else {
      deltas[key] = deltaMetric(before[key], after[key])
    }
  }
  return deltas
}

/**
 * Before/after under the same bike / side / hand / calibration version.
 * If conditions differ, `restricted` is true — deltas are still filled but
 * must not be treated as a like-for-like comparison. No Ampel scoring.
 */
export function compareSessions(before: MeasurementSession, after: MeasurementSession): SessionComparison {
  const restrictedReasons = differingConditions(before.conditions, after.conditions)
  const restricted = restrictedReasons.length > 0
  return {
    beforeId: before.id,
    afterId: after.id,
    comparable: !restricted,
    restricted,
    restrictedReasons,
    deltas: diffMetrics(before.metrics, after.metrics),
  }
}

export const PHASE_COMPARE_REASONS = ['source', 'side', 'method', 'calibration'] as const
export type PhaseCompareReason = (typeof PHASE_COMPARE_REASONS)[number]

export type PhaseComparison = {
  compatible: boolean
  reasons: PhaseCompareReason[]
  bikeChanged: boolean
  bikeNote: string | null
}

/**
 * Image before/after is allowed only when source, measure side, method, and
 * calibration identity match. A bike-name change is noted, not a hard gate.
 */
export function comparePhaseResults(
  before: MeasurementResult,
  after: MeasurementResult,
  bikes?: { before: string; after: string },
): PhaseComparison {
  const reasons: PhaseCompareReason[] = []
  const a = before.phaseEvidence
  const b = after.phaseEvidence
  if (!a || !b) {
    return {
      compatible: false,
      reasons: ['source', 'side', 'method', 'calibration'],
      bikeChanged: Boolean(bikes && normalizeBike(bikes.before) !== normalizeBike(bikes.after)),
      bikeNote: null,
    }
  }
  if (before.source !== after.source || a.source !== b.source) reasons.push('source')
  if (a.side !== b.side) reasons.push('side')
  if (
    a.selectionMethod !== PHASE_SELECTION_METHOD ||
    b.selectionMethod !== PHASE_SELECTION_METHOD ||
    a.metricMethod !== b.metricMethod
  ) {
    reasons.push('method')
  }
  if (a.calibrationVersion !== b.calibrationVersion) reasons.push('calibration')
  else if (a.setupId && b.setupId && a.setupId !== b.setupId) reasons.push('calibration')
  const unique = [...new Set(reasons)]
  const bikeChanged = Boolean(bikes && normalizeBike(bikes.before) !== normalizeBike(bikes.after))
  return {
    compatible: unique.length === 0,
    reasons: unique,
    bikeChanged,
    bikeNote: bikeChanged
      ? `Fahrrad geändert: ${bikes!.before.trim() || '—'} → ${bikes!.after.trim() || '—'}.`
      : null,
  }
}

export function compareSessionPhase(before: MeasurementSession, after: MeasurementSession): PhaseComparison {
  const beforeResult = before.result
  const afterResult = after.result
  if (!beforeResult || !afterResult) {
    return {
      compatible: false,
      reasons: ['source', 'side', 'method', 'calibration'],
      bikeChanged: normalizeBike(before.conditions.bike) !== normalizeBike(after.conditions.bike),
      bikeNote: null,
    }
  }
  return comparePhaseResults(beforeResult, afterResult, {
    before: before.conditions.bike,
    after: after.conditions.bike,
  })
}

/** Observation/ActionDecision methods must match. BDC vs max_extension is not a seat delta. */
export function compareResultMethods(
  before: MeasurementResult,
  after: MeasurementResult,
): { compatible: boolean; beforeMethod: string | null; afterMethod: string | null } {
  const beforeMethod = before.observation?.method ?? before.actionDecision?.method ?? null
  const afterMethod = after.observation?.method ?? after.actionDecision?.method ?? null
  return {
    compatible: Boolean(beforeMethod && afterMethod && beforeMethod === afterMethod),
    beforeMethod,
    afterMethod,
  }
}
