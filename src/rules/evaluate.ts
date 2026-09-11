import { decideRule } from './decide.ts'
import { presentAmpel } from './display.ts'
import { recommendRule } from './recommend.ts'
import { getRuleProfile } from './catalog.ts'
import type { RuleMeasurement } from '../types/rules.ts'

/** Fixture measurements for UI plumbing without a rider. */
export const RULE_PLUMBING_FIXTURES: Record<string, RuleMeasurement | null> = {
  none: null,
  invalid: {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: null,
    uncertaintyDeg: 3,
    cycles: 12,
    valid: false,
  },
  few_cycles: {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: 32,
    uncertaintyDeg: 1,
    cycles: 2,
    valid: true,
  },
  within: {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: 32,
    uncertaintyDeg: 1,
    cycles: 12,
    valid: true,
  },
  borderline: {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: 38.5,
    uncertaintyDeg: 1.2,
    cycles: 12,
    valid: true,
  },
  outside: {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: 48,
    uncertaintyDeg: 1,
    cycles: 12,
    valid: true,
  },
}

export function evaluateProfile(
  profileId: string,
  measurement: RuleMeasurement | null,
  allowProvisionalPlumbing: boolean,
) {
  const profile = getRuleProfile(profileId)
  const decision = decideRule(profile, measurement)
  const ampel = presentAmpel(profile, decision, allowProvisionalPlumbing)
  const recommendation = recommendRule(profile, decision)
  return { profile, decision, ampel, recommendation }
}
