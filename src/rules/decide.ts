import type {
  RuleDecision,
  RuleMeasurement,
  RuleProfile,
  RuleUnavailableReason,
} from '../types/rules.ts'

const EPS = 1e-9

function emptyDecision(
  reason: RuleUnavailableReason,
  extras: Partial<RuleDecision> = {},
): RuleDecision {
  return {
    state: 'unavailable',
    profileId: extras.profileId ?? null,
    unavailableReason: reason,
    valueDeg: extras.valueDeg ?? null,
    uncertaintyDeg: extras.uncertaintyDeg ?? null,
    targetDeg: extras.targetDeg ?? null,
    outsideMarginDeg: extras.outsideMarginDeg ?? null,
    lowBoundDeg: extras.lowBoundDeg ?? null,
    highBoundDeg: extras.highBoundDeg ?? null,
    side: extras.side ?? null,
    cycles: extras.cycles ?? null,
    minCycles: extras.minCycles ?? null,
  }
}

function sideOf(valueDeg: number, targetDeg: number): RuleDecision['side'] {
  if (valueDeg > targetDeg + EPS) return 'high'
  if (valueDeg < targetDeg - EPS) return 'low'
  return 'on'
}

/**
 * Decision pipeline:
 * profile present → measurement valid → enough cycles → compare with uncertainty.
 *
 * Window: [target − outsideMargin, target + outsideMargin].
 * Interval: [value − u, value + u].
 * within: interval ⊆ window; outside: interval ∩ window = ∅; else borderline.
 */
export function decideRule(
  profile: RuleProfile | null,
  measurement: RuleMeasurement | null,
): RuleDecision {
  if (!profile) return emptyDecision('profile_missing')

  const bounds = {
    profileId: profile.id,
    targetDeg: profile.targetDeg,
    outsideMarginDeg: profile.outsideMarginDeg,
    lowBoundDeg: profile.targetDeg - profile.outsideMarginDeg,
    highBoundDeg: profile.targetDeg + profile.outsideMarginDeg,
    minCycles: profile.minCycles,
  }

  if (!measurement) {
    return emptyDecision('measurement_invalid', bounds)
  }

  const cycles = measurement.cycles
  const withCycles = { ...bounds, cycles }

  if (measurement.metric !== profile.metric || measurement.method !== profile.method) {
    return emptyDecision('metric_mismatch', withCycles)
  }

  if (
    !measurement.valid ||
    measurement.valueDeg === null ||
    !Number.isFinite(measurement.valueDeg)
  ) {
    return emptyDecision('measurement_invalid', { ...withCycles, valueDeg: measurement.valueDeg })
  }

  if (!Number.isFinite(cycles) || cycles < profile.minCycles) {
    return emptyDecision('insufficient_cycles', {
      ...withCycles,
      valueDeg: measurement.valueDeg,
    })
  }

  const uncertaintyDeg =
    measurement.uncertaintyDeg === null || measurement.uncertaintyDeg === undefined
      ? profile.assumedUncertaintyDeg
      : measurement.uncertaintyDeg

  if (!Number.isFinite(uncertaintyDeg) || uncertaintyDeg < 0) {
    return emptyDecision('uncertainty_missing', {
      ...withCycles,
      valueDeg: measurement.valueDeg,
    })
  }

  const valueDeg = measurement.valueDeg
  if (uncertaintyDeg > profile.outsideMarginDeg + EPS) {
    return emptyDecision('high_spread', {
      ...withCycles,
      valueDeg,
      uncertaintyDeg,
      side: sideOf(valueDeg, profile.targetDeg),
    })
  }
  const low = bounds.lowBoundDeg
  const high = bounds.highBoundDeg
  const intervalLow = valueDeg - uncertaintyDeg
  const intervalHigh = valueDeg + uncertaintyDeg
  const side = sideOf(valueDeg, profile.targetDeg)

  const entirelyInside = intervalLow + EPS >= low && intervalHigh - EPS <= high
  const entirelyOutside = intervalHigh < low - EPS || intervalLow > high + EPS
  const state = entirelyInside ? 'within_target' : entirelyOutside ? 'outside_target' : 'borderline'

  return {
    state,
    profileId: profile.id,
    unavailableReason: null,
    valueDeg,
    uncertaintyDeg,
    targetDeg: profile.targetDeg,
    outsideMarginDeg: profile.outsideMarginDeg,
    lowBoundDeg: low,
    highBoundDeg: high,
    side,
    cycles,
    minCycles: profile.minCycles,
  }
}
