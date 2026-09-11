import { METRIC_KEYS, type MeasurementSession, type SessionComparison, type SessionConditions, type SessionDeltas, type ComparisonRestrictionReason, type SessionMetrics } from '../types/session.ts'

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
