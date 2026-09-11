import type { RuleMeasurement, RuleProfile } from '../types/rules.ts'
import { RULE_PROFILES, getRuleProfile, shippedProductionProfiles } from './catalog.ts'
import { decideRule } from './decide.ts'
import { AMPEL_LABEL_PRODUCTION, AMPEL_LABEL_PROVISIONAL, presentAmpel } from './display.ts'
import { formatRecommendation, recommendRule } from './recommend.ts'
import { RuleProfileError, parseRuleProfile } from './schema.ts'

export type RulesHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type RulesHarnessResult = {
  passed: boolean
  cases: RulesHarnessCase[]
  message: string
}

function measurement(partial: Partial<RuleMeasurement> = {}): RuleMeasurement {
  return {
    metric: 'knee_flexion',
    method: 'bottom_dead_center',
    valueDeg: 32,
    uncertaintyDeg: 1,
    cycles: 12,
    valid: true,
    ...partial,
  }
}

function assert(name: string, ok: boolean, detail: string): RulesHarnessCase {
  return { name, passed: ok, detail }
}

function approvedFixture(): RuleProfile {
  return parseRuleProfile({
    ...RULE_PROFILES[0],
    id: 'knee-flexion-bdc.approved-fixture.v1',
    status: 'approved',
    productionEnabled: true,
    reviewedAt: '2026-09-11T00:00:00.000Z',
    reviewer: 'harness',
    notes: 'In-memory fixture only. Not shipped.',
  })
}

/** Deterministic pipeline cases. Safe on a VM; no LLM. */
export function runRulesHarness(): RulesHarnessResult {
  const shipped = getRuleProfile('knee-flexion-bdc.v1')
  const nutzerziel = getRuleProfile('knee-flexion-nutzerziel.v1')
  const cases: RulesHarnessCase[] = []

  cases.push(
    assert(
      'catalog-parses',
      Boolean(shipped && nutzerziel) && RULE_PROFILES.length >= 2,
      `profiles=${RULE_PROFILES.map((p) => p.id).join(',')}`,
    ),
  )

  cases.push(
    assert(
      'no-shipped-production',
      shippedProductionProfiles().length === 0 && shipped?.productionEnabled === false,
      'P0 must not ship productionEnabled profiles',
    ),
  )

  cases.push(
    assert(
      'profile-missing',
      decideRule(null, measurement()).state === 'unavailable' &&
        decideRule(null, measurement()).unavailableReason === 'profile_missing',
      'missing profile → unavailable',
    ),
  )

  if (shipped) {
    const invalid = decideRule(shipped, measurement({ valid: false, valueDeg: null }))
    cases.push(
      assert(
        'measurement-invalid',
        invalid.state === 'unavailable' && invalid.unavailableReason === 'measurement_invalid',
        String(invalid.unavailableReason),
      ),
    )

    const few = decideRule(shipped, measurement({ cycles: 3 }))
    cases.push(
      assert(
        'insufficient-cycles',
        few.state === 'unavailable' && few.unavailableReason === 'insufficient_cycles',
        `cycles=${few.cycles} min=${few.minCycles}`,
      ),
    )

    const within = decideRule(shipped, measurement({ valueDeg: 32, uncertaintyDeg: 1 }))
    cases.push(assert('within-target', within.state === 'within_target', `state=${within.state}`))

    const borderline = decideRule(shipped, measurement({ valueDeg: 38.5, uncertaintyDeg: 1.2 }))
    cases.push(
      assert('borderline', borderline.state === 'borderline', `state=${borderline.state}`),
    )

    const outside = decideRule(shipped, measurement({ valueDeg: 48, uncertaintyDeg: 1 }))
    cases.push(
      assert(
        'outside-target',
        outside.state === 'outside_target' && outside.side === 'high',
        `state=${outside.state} side=${outside.side}`,
      ),
    )

    const outsideLow = decideRule(shipped, measurement({ valueDeg: 18, uncertaintyDeg: 1 }))
    cases.push(
      assert(
        'outside-low',
        outsideLow.state === 'outside_target' && outsideLow.side === 'low',
        `state=${outsideLow.state} side=${outsideLow.side}`,
      ),
    )

    const mismatch = decideRule(shipped, {
      ...measurement(),
      metric: 'not_a_metric' as RuleMeasurement['metric'],
    })
    cases.push(
      assert(
        'metric-mismatch',
        mismatch.state === 'unavailable' && mismatch.unavailableReason === 'metric_mismatch',
        String(mismatch.unavailableReason),
      ),
    )

    const methodMismatch = decideRule(shipped, measurement({ method: 'cycle_mean', valueDeg: 58, cycles: 12 }))
    cases.push(
      assert(
        'a1-method-mismatch-blocks-bdc-rule',
        methodMismatch.state === 'unavailable' &&
          methodMismatch.unavailableReason === 'metric_mismatch' &&
          methodMismatch.valueDeg === null,
        String(methodMismatch.unavailableReason),
      ),
    )

    const usableNotPedal = decideRule(shipped, measurement({ cycles: 3, valueDeg: 36 }))
    cases.push(
      assert(
        'a6-usable-cycles-not-pedal-revs',
        usableNotPedal.state === 'unavailable' &&
          usableNotPedal.unavailableReason === 'insufficient_cycles' &&
          usableNotPedal.cycles === 3 &&
          usableNotPedal.minCycles === shipped.minCycles,
        `cycles=${usableNotPedal.cycles} min=${usableNotPedal.minCycles}`,
      ),
    )

    const gray = presentAmpel(shipped, within, false)
    cases.push(
      assert(
        'gray-without-production',
        gray.tone === 'gray' && gray.productionAmpel === false && gray.state === 'unavailable',
        `${gray.tone} ${gray.label}`,
      ),
    )

    const plumbing = presentAmpel(shipped, within, true)
    cases.push(
      assert(
        'provisional-plumbing-labeled',
        plumbing.tone === 'green' &&
          plumbing.productionAmpel === false &&
          plumbing.plumbingOnly === true &&
          plumbing.label === AMPEL_LABEL_PROVISIONAL,
        plumbing.label,
      ),
    )

    const rec = formatRecommendation(recommendRule(shipped, outside))
    cases.push(
      assert(
        'recommendation-structure',
        rec.includes('Beobachtung:') &&
          rec.includes('Mögliche Erklärung:') &&
          rec.includes('Voraussetzung:') &&
          rec.includes('Nächster Schritt:') &&
          rec.includes('Erneut messen:'),
        rec.slice(0, 80),
      ),
    )

    cases.push(
      assert(
        'no-exact-saddle-mm',
        !/\d+(?:[.,]\d+)?\s*mm\b/i.test(rec) && !/sattel\s+exakt/i.test(rec),
        rec,
      ),
    )

    const twice = formatRecommendation(recommendRule(shipped, outside))
    cases.push(assert('deterministic', rec === twice, 'same input → same copy'))
  }

  let rejectedProductionWithoutApproval = false
  try {
    parseRuleProfile({
      ...RULE_PROFILES[0],
      productionEnabled: true,
      status: 'provisional',
    })
  } catch (error) {
    rejectedProductionWithoutApproval = error instanceof RuleProfileError
  }
  cases.push(
    assert(
      'reject-production-without-approval',
      rejectedProductionWithoutApproval,
      'provisional + productionEnabled must fail parse',
    ),
  )

  const approved = approvedFixture()
  const production = presentAmpel(
    approved,
    decideRule(approved, measurement({ valueDeg: 32, uncertaintyDeg: 1 })),
    false,
  )
  cases.push(
    assert(
      'production-ampel-only-when-enabled',
      production.productionAmpel === true &&
        production.tone === 'green' &&
        production.label === AMPEL_LABEL_PRODUCTION,
      production.label,
    ),
  )

  const passed = cases.every((item) => item.passed)
  return {
    passed,
    cases,
    message: passed
      ? `Rules harness passed — ${cases.length} cases, no shipped production Ampel.`
      : `Rules harness failed — ${cases.filter((item) => !item.passed).map((item) => item.name).join(', ')}.`,
  }
}
