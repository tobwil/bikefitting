import { beginnerSeatAction, decideAction } from '../action/decide.ts'
import { presentActionDecision } from '../action/present.ts'
import { parseActionDecision } from '../action/schema.ts'
import { parseMeasurementResult } from '../sessions/parseResult.ts'
import { compareResultMethods } from '../sessions/compare.ts'
import { snapshotForExport, snapshotForResave, identitySnapshot } from './resultSnapshot.ts'
import { resultToJson, resultToMarkdown } from './exportResult.ts'
import { stubAnalyzeCapture, honestObservation } from './analysisStub.ts'
import { parseAnalysisPayload } from './observationParse.ts'
import { freezeObservationResult } from './freezeObservation.ts'
import { decideFromObservation, OUTCOME_PRIMARY, outcomeView, methodsCompatible } from './outcome.ts'
import type { CaptureAsset } from '../types/capture.ts'
import type { ObservationReport } from '../types/observation.ts'
import { OBSERVATION_KIND, OBSERVATION_SCHEMA_VERSION } from '../types/observation.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'

export type ResultHarnessCase = { name: string; passed: boolean; detail: string }

function check(
  cases: ResultHarnessCase[],
  name: string,
  passed: boolean,
  detail: string,
) {
  cases.push({ name, passed, detail })
}

function fixtureAsset(over: Partial<CaptureAsset> = {}): CaptureAsset {
  return {
    kind: 'bikefit.capture',
    schemaVersion: 1,
    captureId: 'cap-ap06',
    blobKey: 'cap-ap06',
    contentHash: 'hash-ap06',
    mimeType: 'video/webm',
    codec: 'vp8',
    durationMs: 40000,
    width: 1920,
    height: 1080,
    rotationDeg: 0,
    captureType: 'continuity',
    completeness: 'complete',
    intendedDurationMs: 40000,
    createdAt: '2026-09-14T12:00:00.000Z',
    hasAudio: false,
    byteLength: 1200,
    filename: 'clip.webm',
    ...over,
  }
}

function ap05Shaped(over: Partial<ObservationReport> = {}): ObservationReport {
  return {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId: 'cap-ap05',
    analysisId: 'an-ap05',
    jobId: 'job-ap05',
    inputHash: 'hash-ap05',
    pipelineVersion: 'max_extension.p10.v1',
    status: 'usable',
    reasons: [],
    reasonText: 'Kniebeugung nahe größter Streckung aus zehn Zyklen.',
    method: 'max_extension',
    methodVersion: 'max_extension.p10.v1',
    phaseSource: 'motion_estimate',
    side: 'right',
    mediaStartMs: 2000,
    mediaEndMs: 38000,
    geometryRevision: 1,
    metrics: [
      {
        id: 'knee_flexion',
        method: 'max_extension',
        methodVersion: 'max_extension.p10.v1',
        value: 42,
        unit: 'deg',
        usableCycles: 12,
        spread: 2.1,
        available: true,
        reasons: [],
        evidenceIds: ['frame:12'],
      },
    ],
    evidence: [{ id: 'frame:12', mediaTimeMs: 8400, caption: 'Streckung' }],
    stub: false,
    completedAt: '2026-09-14T12:02:00.000Z',
    ...over,
  }
}

export function runResultHarness(): { passed: boolean; message: string; cases: ResultHarnessCase[] } {
  const cases: ResultHarnessCase[] = []

  check(
    cases,
    'primary-action-table',
    OUTCOME_PRIMARY.adjust.code === 'save' &&
      OUTCOME_PRIMARY.keep.code === 'save' &&
      OUTCOME_PRIMARY.retake.code === 'retake' &&
      OUTCOME_PRIMARY.review.code === 'reanalyze' &&
      OUTCOME_PRIMARY.retake.label === 'Neu aufnehmen' &&
      OUTCOME_PRIMARY.review.label.includes('erneut auswerten'),
    `${OUTCOME_PRIMARY.adjust.code}/${OUTCOME_PRIMARY.keep.code}/${OUTCOME_PRIMARY.retake.code}/${OUTCOME_PRIMARY.review.code}`,
  )

  const stub = stubAnalyzeCapture({ asset: fixtureAsset(), completedAt: '2026-09-14T12:01:00.000Z', analysisId: 'an-stub' })
  const stubResult = freezeObservationResult({ observation: stub, capture: fixtureAsset() })
  const stubAction = decideFromObservation(stub)
  const stubView = outcomeView({ action: stubAction, observation: stub, hasCaptureAsset: true })
  const stubSnap = identitySnapshot(stubResult)
  check(
    cases,
    'stub-complete-clip-is-review-not-adjust',
    stub.status === 'incomplete' &&
      stub.stub === true &&
      stub.metrics[0]!.value === null &&
      stubAction.kind === 'review' &&
      stubAction.parameter === null &&
      stubAction.direction === null &&
      !beginnerSeatAction(stubAction) &&
      stubView.primary.code === 'reanalyze' &&
      stubView.seatDirection === 'none' &&
      !/sattel etwas höher/i.test(stubAction.template.what + stubAction.template.why),
    stubAction.kind,
  )
  check(
    cases,
    'immutable-snapshot-has-identity',
    stubSnap.captureId === 'cap-ap06' &&
      stubSnap.analysisId === 'an-stub' &&
      stubSnap.actionDecision.kind === 'review' &&
      stubSnap.evidenceRefs.includes('capture:cap-ap06') &&
      stubResult.captureId === 'cap-ap06' &&
      stubResult.analysisId === 'an-stub',
    `${stubSnap.captureId}/${stubSnap.analysisId}/${stubSnap.method ?? 'null'}`,
  )

  const incomplete = stubAnalyzeCapture({
    asset: fixtureAsset({ completeness: 'incomplete', durationMs: 4000 }),
    analysisId: 'an-inc',
  })
  const incompleteAction = decideFromObservation(incomplete)
  check(
    cases,
    'incomplete-capture-is-retake',
    incomplete.status === 'retake' &&
      incompleteAction.kind === 'retake' &&
      outcomeView({ action: incompleteAction, observation: incomplete, hasCaptureAsset: true }).primary.code ===
        'retake' &&
      incomplete.metrics[0]!.value === null,
    incompleteAction.kind,
  )

  const failed = stubAnalyzeCapture({
    asset: fixtureAsset(),
    analysisId: 'an-fail',
    failure: { code: 'decoder_failed', message: 'Clip lässt sich nicht dekodieren (Codec).' },
  })
  const failedAction = decideFromObservation(failed)
  check(
    cases,
    'failed-analysis-is-review-with-concrete-reason',
    failed.status === 'failed' &&
      failedAction.kind === 'review' &&
      failed.reasonText.includes('dekodieren') &&
      failedAction.template.why.includes('dekodieren') &&
      failed.metrics[0]!.value === null &&
      !/qualität ausreichend/i.test(failed.reasonText),
    failed.reasonText,
  )

  const fakeStub = honestObservation({
    ...stub,
    status: 'usable',
    method: 'bottom_dead_center',
    metrics: [
      {
        id: 'knee_flexion',
        method: 'bottom_dead_center',
        methodVersion: 'v1',
        value: 32,
        unit: 'deg',
        usableCycles: 12,
        spread: 1,
        available: true,
        reasons: [],
        evidenceIds: [],
      },
    ],
  })
  check(
    cases,
    'stub-cannot-soothe-with-fake-usable-knee',
    fakeStub.stub === true &&
      fakeStub.status !== 'usable' &&
      fakeStub.metrics[0]!.value === null &&
      fakeStub.metrics[0]!.available === false &&
      decideFromObservation(fakeStub).kind !== 'adjust',
    fakeStub.status,
  )

  const ap05 = ap05Shaped()
  const parsedAp05 = parseAnalysisPayload(ap05)
  const ap05Action = parsedAp05.ok ? decideFromObservation(parsedAp05.value) : null
  check(
    cases,
    'ap05-max-extension-payload-stays-review-without-released-profile',
    parsedAp05.ok &&
      ap05Action?.kind === 'review' &&
      ap05Action.method === 'max_extension' &&
      ap05Action.parameter === null &&
      ap05Action.blockReasons.includes('markerless_not_released') &&
      !beginnerSeatAction(ap05Action),
    ap05Action?.kind ?? (parsedAp05.ok ? 'ok' : parsedAp05.reason),
  )

  const bdcProfile = matchingRuleProfile('knee_flexion', 'bottom_dead_center')
  const r2 = decideAction({
    captureId: 'cap-r2',
    analysisId: 'an-r2',
    method: 'bottom_dead_center',
    valueDeg: 50,
    uncertaintyDeg: 1,
    cycles: 12,
    kneePresent: true,
    qualityLevel: 'ok',
    profile: bdcProfile,
    evidenceIds: ['phase:bdc'],
  })
  check(
    cases,
    'ap10-r2-still-no-beginner-seat-from-provisional-bdc',
    r2.kind === 'review' && r2.parameter === null && r2.direction === null && !beginnerSeatAction(r2),
    r2.kind,
  )

  const methods = compareResultMethods(stubResult, freezeObservationResult({ observation: ap05 }))
  check(
    cases,
    'compare-rejects-stub-vs-max-extension',
    methods.compatible === false,
    `${methods.beforeMethod} vs ${methods.afterMethod}`,
  )
  check(
    cases,
    'method-identity-bdc-vs-max-extension',
    methodsCompatible('bottom_dead_center', 'max_extension') === false &&
      methodsCompatible('max_extension', 'max_extension') === true,
    'mismatch',
  )

  const exported = snapshotForExport(stubResult, '2026-09-14T12:03:00.000Z')
  const json = resultToJson(exported)
  const md = resultToMarkdown(exported)
  const parsedJson = JSON.parse(json) as { result: unknown }
  const roundtrip = parseMeasurementResult(parsedJson.result)
  const saved = snapshotForResave(stubResult, { id: 'sess-1', title: 'Clip' })
  check(
    cases,
    'save-export-roundtrip-keeps-snapshot-identity',
    roundtrip.ok &&
      roundtrip.value.captureId === 'cap-ap06' &&
      roundtrip.value.analysisId === 'an-stub' &&
      roundtrip.value.observation?.stub === true &&
      roundtrip.value.actionDecision?.kind === 'review' &&
      saved.result.captureId === 'cap-ap06' &&
      json.includes('"captureId": "cap-ap06"') &&
      md.includes('captureId') &&
      md.includes('an-stub') &&
      !/\d+(?:[.,]\d+)?\s*mm\b/i.test(json) &&
      !/sattel etwas höher/i.test(md),
    roundtrip.ok ? 'roundtrip' : roundtrip.reason,
  )

  const parsedDecision = parseActionDecision(stubAction)
  const presented = presentActionDecision(stubAction)
  check(
    cases,
    'stored-review-is-not-upgraded-to-adjust',
    parsedDecision.ok &&
      parsedDecision.value?.kind === 'review' &&
      presented.kind === 'review' &&
      presented.parameter === null,
    presented.kind,
  )

  const why = stubView.why
  check(
    cases,
    'warum-covers-metrics-method-evidence-limits',
    why.metrics.includes('Knie') &&
      why.method.length > 0 &&
      why.evidence.includes('capture:cap-ap06') &&
      why.limits.length > 0,
    'why',
  )

  const failedCases = cases.filter((item) => !item.passed)
  return {
    passed: failedCases.length === 0,
    message: failedCases.length === 0 ? `RESULT_HARNESS_OK — ${cases.length} checks` : `RESULT_HARNESS_FAIL — ${failedCases.map((item) => item.name).join(', ')}`,
    cases,
  }
}
