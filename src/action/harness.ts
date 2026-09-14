import { RULE_PROFILES } from '../rules/catalog.ts'
import { parseRuleProfile } from '../rules/schema.ts'
import type { RuleProfile } from '../types/rules.ts'
import {
  MEASUREMENT_RESULT_SCHEMA_VERSION,
  type MeasurementResult,
} from '../types/result.ts'
import { decideAction, beginnerSeatAction } from './decide.ts'
import { recommendationsFromAction } from './recommendations.ts'
import { actionFromMeasurementResult, presentActionDecision } from './present.ts'
import { parseActionDecision } from './schema.ts'
import type { ActionDecision, ActionDecisionInput } from '../types/action.ts'
import { ACTION_DECISION_KIND, ACTION_DECISION_SCHEMA_VERSION } from '../types/action.ts'

export type ActionHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type ActionHarnessResult = {
  passed: boolean
  cases: ActionHarnessCase[]
  message: string
}

const SEAT_DIRECTION = /sattel etwas (höher|tiefer)/i

function assert(name: string, ok: boolean, detail: string): ActionHarnessCase {
  return { name, passed: ok, detail }
}

function shippedBdc(): RuleProfile {
  const profile = RULE_PROFILES.find((item) => item.id === 'knee-flexion-bdc.v1')
  if (!profile) throw new Error('missing shipped BDC profile')
  return profile
}

function approvedFixture(): RuleProfile {
  return parseRuleProfile({
    ...shippedBdc(),
    id: 'knee-flexion-bdc.approved-fixture.v1',
    status: 'approved',
    productionEnabled: true,
    reviewedAt: '2026-09-14T00:00:00.000Z',
    reviewer: 'harness',
    notes: 'In-memory AP-10 fixture only. Not shipped.',
  })
}

function r2Input(overrides: Partial<ActionDecisionInput> = {}): ActionDecisionInput {
  return {
    captureId: 'cap-r2',
    analysisId: 'an-r2',
    audience: 'beginner',
    method: 'bottom_dead_center',
    metric: 'knee_flexion',
    valueDeg: 50,
    uncertaintyDeg: 1,
    cycles: 12,
    kneePresent: true,
    qualityLevel: 'ok',
    profile: shippedBdc(),
    urlProductionFlag: false,
    lensStatus: 'validated',
    contradiction: false,
    painReported: false,
    supportedContext: true,
    evidenceIds: ['phase:bdc'],
    ...overrides,
  }
}

function blobOf(decision: ActionDecision): string {
  return `${decision.kind} ${decision.template.what} ${decision.template.why} ${decision.template.how}`
}

function noSeat(decision: ActionDecision): boolean {
  return (
    !beginnerSeatAction(decision) &&
    decision.parameter === null &&
    decision.direction === null &&
    !SEAT_DIRECTION.test(blobOf(decision))
  )
}

function v1Result(partial: Partial<MeasurementResult> & Pick<MeasurementResult, 'metrics' | 'quality' | 'recommendations'>): MeasurementResult {
  return {
    schemaVersion: MEASUREMENT_RESULT_SCHEMA_VERSION,
    id: 'res-v1',
    createdAt: '2026-09-11T10:00:00.000Z',
    time: { startedAt: '2026-09-11T10:00:00.000Z', endedAt: '2026-09-11T10:01:00.000Z' },
    source: 'camera',
    provenance: { capture: 'camera', evaluation: 'standard', productRelease: 'p0' },
    profile: { id: 'lab', name: 'Labor / nicht freigegeben', productionEnabled: false },
    ruleVersions: [
      {
        id: 'knee-flexion-bdc.v1',
        schemaVersion: 1,
        status: 'provisional',
        productionEnabled: false,
        method: 'bottom_dead_center',
      },
    ],
    method: {
      metrics: 'E4',
      rules: '§10.4',
      aggregation: 'median',
      calibration: 'pixelToBike v1',
    },
    calibration: {
      version: 1,
      marks: { B: null, S: null, G: null },
      transform: null,
      createdAt: '2026-09-11T10:00:00.000Z',
      updatedAt: '2026-09-11T10:00:00.000Z',
    },
    validRevs: 12,
    targetRevs: 10,
    adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
    ...partial,
  }
}

export function runActionHarness(): ActionHarnessResult {
  const cases: ActionHarnessCase[] = []
  const shipped = shippedBdc()
  const approved = approvedFixture()

  const r2 = decideAction(r2Input())
  const r2Recs = recommendationsFromAction(r2)
  const r2Text = `${blobOf(r2)} ${JSON.stringify(r2Recs)}`
  cases.push(
    assert(
      'r2-provisional-bdc-50-no-beginner-seat-action',
      r2.kind === 'review' &&
        r2.releaseStatus === 'provisional' &&
        r2.released === false &&
        r2.productionEnabled === false &&
        r2.report.valueDeg === 50 &&
        r2.blockReasons.includes('profile_provisional') &&
        r2.blockReasons.includes('production_disabled') &&
        r2.blockReasons.includes('profile_unreleased') &&
        noSeat(r2) &&
        !SEAT_DIRECTION.test(r2Text) &&
        r2.captureId === 'cap-r2' &&
        r2.analysisId === 'an-r2' &&
        r2.ruleId === 'knee-flexion-bdc.v1' &&
        r2.evidenceIds.includes('phase:bdc'),
      `kind=${r2.kind} title=${r2.template.what}`,
    ),
  )

  const urlUnlock = decideAction(r2Input({ urlProductionFlag: true }))
  cases.push(
    assert(
      'r2-url-flag-does-not-unlock',
      urlUnlock.kind !== 'adjust' &&
        urlUnlock.blockReasons.includes('url_flag_ignored') &&
        noSeat(urlUnlock),
      `kind=${urlUnlock.kind} reasons=${urlUnlock.blockReasons.join(',')}`,
    ),
  )

  cases.push(
    assert(
      'shipped-profile-is-provisional',
      shipped.productionEnabled === false && shipped.status === 'provisional',
      `${shipped.id} ${shipped.status}`,
    ),
  )

  const missingKnee = decideAction(r2Input({ kneePresent: false, valueDeg: null }))
  cases.push(
    assert(
      'missing-knee-is-retake',
      missingKnee.kind === 'retake' &&
        missingKnee.blockReasons.includes('missing_knee') &&
        noSeat(missingKnee),
      missingKnee.kind,
    ),
  )

  const cycleMean = decideAction(
    r2Input({
      method: 'cycle_mean',
      valueDeg: 58,
      profile: shipped,
    }),
  )
  const cycleMeanRecs = JSON.stringify(recommendationsFromAction(cycleMean))
  cases.push(
    assert(
      'unsupported-method-blocks-seat',
      cycleMean.kind === 'review' &&
        cycleMean.blockReasons.includes('method_mismatch') &&
        noSeat(cycleMean) &&
        !cycleMeanRecs.includes('58'),
      `kind=${cycleMean.kind} reasons=${cycleMean.blockReasons.join(',')}`,
    ),
  )

  const markerless = decideAction(
    r2Input({
      method: 'max_extension',
      profile: null,
      valueDeg: 44,
    }),
  )
  cases.push(
    assert(
      'markerless-without-released-profile-is-review',
      markerless.kind === 'review' &&
        markerless.blockReasons.includes('markerless_not_released') &&
        noSeat(markerless) &&
        !SEAT_DIRECTION.test(blobOf(markerless)),
      markerless.template.what,
    ),
  )

  const lens = decideAction(r2Input({ profile: approved, lensStatus: 'unknown' }))
  cases.push(
    assert(
      'unvalidated-lens-blocks-adjust',
      lens.kind === 'review' && lens.blockReasons.includes('unvalidated_lens') && noSeat(lens),
      lens.kind,
    ),
  )

  const contradiction = decideAction(r2Input({ profile: approved, contradiction: true }))
  cases.push(
    assert(
      'contradictory-evidence-no-forced-adjust',
      contradiction.kind === 'review' &&
        contradiction.blockReasons.includes('contradictory_evidence') &&
        noSeat(contradiction),
      contradiction.kind,
    ),
  )

  const pain = decideAction(r2Input({ profile: approved, painReported: true }))
  cases.push(
    assert(
      'pain-no-forced-adjust',
      pain.kind === 'review' && pain.blockReasons.includes('pain_reported') && noSeat(pain),
      pain.kind,
    ),
  )

  const releasedAdjust = decideAction(r2Input({ profile: approved, lensStatus: 'validated' }))
  cases.push(
    assert(
      'released-profile-may-adjust-direction-only',
      releasedAdjust.kind === 'adjust' &&
        releasedAdjust.released &&
        releasedAdjust.parameter === 'seat_height' &&
        releasedAdjust.direction === 'higher' &&
        releasedAdjust.report.valueDeg === 50 &&
        releasedAdjust.report.targetDeg === approved.targetDeg &&
        SEAT_DIRECTION.test(releasedAdjust.template.what) &&
        !/\d+(?:[.,]\d+)?\s*mm\b/i.test(blobOf(releasedAdjust)),
      `${releasedAdjust.kind} ${releasedAdjust.direction} ${releasedAdjust.template.what}`,
    ),
  )

  const releasedKeep = decideAction(
    r2Input({ profile: approved, valueDeg: 32, uncertaintyDeg: 1, lensStatus: 'validated' }),
  )
  cases.push(
    assert(
      'released-within-is-keep',
      releasedKeep.kind === 'keep' && releasedKeep.parameter === null && releasedKeep.direction === null,
      releasedKeep.kind,
    ),
  )

  const v1 = actionFromMeasurementResult(
    v1Result({
      metrics: [
        {
          id: 'knee_flexion',
          label: 'Kniebeugung',
          value: 50,
          unit: '°',
          method: 'bottom_dead_center',
          usableCycles: 12,
          band: 'out',
          targetHint: 'BDC',
        },
      ],
      quality: {
        level: 'ok',
        label: 'Qualität ausreichend',
        validRevs: 12,
        targetRevs: 10,
        lostFrames: 0,
        notes: [],
        measurementId: 'meas-v1',
      },
      recommendations: [
        {
          priority: 1,
          title: 'Sattel etwas höher versuchen, nur als Richtung. Nicht auf eine genaue Absenkung oder Anhebung festlegen.',
          reason: 'Provisorisches Profil.',
        },
      ],
    }),
  )
  cases.push(
    assert(
      'v1-result-readable-no-retroactive-release',
      v1.kind !== 'adjust' &&
        v1.released === false &&
        v1.releaseStatus === 'provisional' &&
        noSeat(v1) &&
        !SEAT_DIRECTION.test(blobOf(v1)),
      `kind=${v1.kind} what=${v1.template.what}`,
    ),
  )

  const fakeStored: ActionDecision = {
    schemaVersion: ACTION_DECISION_SCHEMA_VERSION,
    type: ACTION_DECISION_KIND,
    kind: 'adjust',
    captureId: 'cap',
    analysisId: 'an',
    ruleId: 'knee-flexion-bdc.v1',
    ruleVersion: 1,
    method: 'bottom_dead_center',
    releaseStatus: 'provisional',
    released: true,
    productionEnabled: true,
    evidenceIds: [],
    parameter: 'seat_height',
    direction: 'higher',
    template: {
      what: 'Sattel etwas höher setzen — nur Richtung, keine Millimeter.',
      why: 'fake release',
      how: 'recheck',
    },
    blockReasons: [],
    audience: 'beginner',
    report: {
      valueDeg: 50,
      uncertaintyDeg: 1,
      cycles: 12,
      targetDeg: 32,
      lowBoundDeg: 25,
      highBoundDeg: 39,
    },
  }
  const clamped = presentActionDecision(fakeStored)
  cases.push(
    assert(
      'stored-fake-release-is-clamped',
      clamped.kind !== 'adjust' && clamped.parameter === null && clamped.direction === null && noSeat(clamped),
      `kind=${clamped.kind}`,
    ),
  )

  const parsed = parseActionDecision(r2)
  cases.push(
    assert(
      'action-decision-roundtrip',
      parsed.ok && parsed.value?.kind === 'review' && parsed.value.report.valueDeg === 50,
      parsed.ok ? parsed.value?.kind ?? 'ok' : parsed.reason,
    ),
  )

  const absent = parseActionDecision(undefined)
  cases.push(
    assert('legacy-missing-action-parses', absent.ok && absent.value === undefined, String(absent.ok)),
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `ACTION_HARNESS_OK — ${cases.length} checks (R2 regression included).`
        : `ACTION_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
