import { beginnerSeatAction, decideAction } from '../action/decide.ts'
import { freezeObservationResult } from '../flow/freezeObservation.ts'
import { decideFromObservation } from '../flow/outcome.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'
import type { CaptureAsset } from '../types/capture.ts'
import type { ObservationReport } from '../types/observation.ts'
import { OBSERVATION_KIND, OBSERVATION_SCHEMA_VERSION } from '../types/observation.ts'
import type { CaptureSetupFingerprint, ObservationSnapshot } from '../types/change.ts'
import { REPEATABILITY_BAND_DEG } from '../types/change.ts'
import { attachChangeLoop } from './attach.ts'
import { canDocumentChange, documentPathProminent } from './canDocument.ts'
import { compareDocumentedChange } from './compare.ts'
import { CHANGE_COPY, assertSafeChangeCopy } from './copy.ts'
import { createDocumentedChange, snapshotFromResult } from './document.ts'
import { parseChangeLink } from './schema.ts'
import { emptySetup } from './setup.ts'

export type ChangeHarnessCase = { name: string; passed: boolean; detail: string }
export type ChangeHarnessResult = { passed: boolean; message: string; cases: ChangeHarnessCase[] }

function check(cases: ChangeHarnessCase[], name: string, passed: boolean, detail: string) {
  cases.push({ name, passed, detail })
}

function asset(over: Partial<CaptureAsset> = {}): CaptureAsset {
  return {
    kind: 'bikefit.capture',
    schemaVersion: 1,
    captureId: 'cap-a',
    blobKey: 'cap-a',
    contentHash: 'hash-a',
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
    filename: 'clip-a.webm',
    ...over,
  }
}

function observation(over: Partial<ObservationReport> = {}): ObservationReport {
  return {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId: 'cap-a',
    analysisId: 'an-a',
    jobId: 'job-a',
    inputHash: 'hash-a',
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
    evidence: [{ id: 'frame:12', mediaTimeMs: 8400 }],
    stub: false,
    completedAt: '2026-09-14T12:02:00.000Z',
    ...over,
  }
}

function setup(over: Partial<CaptureSetupFingerprint> = {}): CaptureSetupFingerprint {
  return {
    ...emptySetup(),
    deviceId: 'cam-iphone',
    cameraKind: 'continuity',
    captureType: 'continuity',
    width: 1920,
    height: 1080,
    geometryRevision: 1,
    setupId: 'camera:cam-iphone:1920x1080:r1',
    lensStatus: 'unknown',
    userReportedLens: null,
    ...over,
  }
}

function snapFrom(
  resultId: string,
  obs: ObservationReport,
  setupFp: CaptureSetupFingerprint,
  value = 42,
): ObservationSnapshot {
  const result = freezeObservationResult({
    observation: {
      ...obs,
      metrics: obs.metrics.map((item) =>
        item.id === 'knee_flexion' ? { ...item, value } : item,
      ),
    },
    capture: asset({ captureId: obs.captureId }),
  })
  return snapshotFromResult(
    { ...result, id: resultId },
    { setup: setupFp, asset: asset({ captureId: obs.captureId, width: setupFp.width ?? 1920, height: setupFp.height ?? 1080, captureType: setupFp.captureType ?? 'continuity' }) },
  )
}

const IMPROVED = /verbessert|\bbesser\b/i

export function runChangeHarness(): ChangeHarnessResult {
  const cases: ChangeHarnessCase[] = []

  for (const [key, text] of Object.entries(CHANGE_COPY)) {
    try {
      assertSafeChangeCopy(text, key)
      check(cases, `copy-safe-${key}`, !IMPROVED.test(text) && !/\d+\s*mm\b/i.test(text), text.slice(0, 80))
    } catch (err) {
      check(cases, `copy-safe-${key}`, false, err instanceof Error ? err.message : 'unsafe')
    }
  }

  const beforeObs = observation()
  const beforeResult = freezeObservationResult({ observation: beforeObs, capture: asset() })
  const beforeSnap = snapFrom(beforeResult.id, beforeObs, setup(), 42)
  const change = createDocumentedChange({
    previous: beforeSnap,
    direction: 'higher',
    noteOld: 'Markierung A',
    noteNew: 'eine kleine Stufe',
    source: 'user_path',
    createdAt: '2026-09-14T13:00:00.000Z',
    id: 'chg-1',
  })

  const afterObs = observation({
    captureId: 'cap-b',
    analysisId: 'an-b',
    jobId: 'job-b',
    metrics: beforeObs.metrics.map((item) => ({ ...item, value: 43.2 })),
  })
  const afterResult = freezeObservationResult({
    observation: afterObs,
    capture: asset({ captureId: 'cap-b', filename: 'clip-b.webm' }),
  })
  const afterSnap = snapFrom(afterResult.id, afterObs, setup(), 43.2)
  const compatible = compareDocumentedChange({ change, after: afterSnap, createdAt: '2026-09-14T13:10:00.000Z', id: 'cmp-1' })
  const linked = attachChangeLoop({ pending: change, afterResult, afterSnapshot: afterSnap })

  check(
    cases,
    'document-a-capture-b-compatible-same-method',
    change.previous.captureId === 'cap-a' &&
      afterSnap.captureId === 'cap-b' &&
      compatible.comparable &&
      compatible.method === 'max_extension' &&
      compatible.methodVersion === 'max_extension.p10.v1' &&
      compatible.compatibility.method &&
      compatible.compatibility.methodVersion &&
      linked.changeLink?.previousCaptureId === 'cap-a' &&
      linked.changeLink.nextCaptureId === 'cap-b' &&
      linked.changeLink.documentedChange.id === 'chg-1' &&
      linked.changeLink.comparison.method === 'max_extension',
    `${compatible.method} ${compatible.verdict} link=${linked.changeLink?.kind ?? 'none'}`,
  )

  const methodMismatch = compareDocumentedChange({
    change,
    after: {
      ...afterSnap,
      method: 'bottom_dead_center',
      methodVersion: 'bdc.v1',
      valueDeg: 32,
    },
  })
  check(
    cases,
    'incompatible-method-not-besser',
    methodMismatch.comparable === false &&
      methodMismatch.verdict === 'not_comparable' &&
      methodMismatch.headline === CHANGE_COPY.notComparable &&
      methodMismatch.compatibility.reasons.includes('method_mismatch') &&
      !IMPROVED.test(methodMismatch.headline + methodMismatch.detail) &&
      methodMismatch.method === null,
    methodMismatch.headline,
  )

  const cameraChange = compareDocumentedChange({
    change,
    after: {
      ...afterSnap,
      setup: setup({
        deviceId: 'cam-mac',
        cameraKind: 'mac_webcam',
        captureType: 'webcam',
        geometryRevision: 4,
        setupId: 'camera:cam-mac:1280x720:r4',
        width: 1280,
        height: 720,
      }),
      valueDeg: 30,
    },
  })
  check(
    cases,
    'incompatible-setup-not-body-improvement',
    cameraChange.comparable === false &&
      cameraChange.verdict === 'not_comparable' &&
      cameraChange.compatibility.reasons.includes('camera_changed') &&
      cameraChange.detail.includes('keine Körperveränderung') &&
      !IMPROVED.test(cameraChange.headline + cameraChange.detail),
    cameraChange.detail,
  )

  const smallDelta = compareDocumentedChange({
    change,
    after: { ...afterSnap, valueDeg: 42 + 1.2 },
  })
  check(
    cases,
    'small-delta-within-band-no-secure-change',
    smallDelta.comparable &&
      smallDelta.verdict === 'no_secure_change' &&
      smallDelta.headline === CHANGE_COPY.noSecureChange &&
      Math.abs(smallDelta.deltaDeg ?? 99) <= REPEATABILITY_BAND_DEG &&
      !IMPROVED.test(smallDelta.headline + smallDelta.detail),
    `${smallDelta.deltaDeg} ${smallDelta.headline}`,
  )

  const largeDelta = compareDocumentedChange({
    change,
    after: { ...afterSnap, valueDeg: 42 + 8 },
  })
  check(
    cases,
    'large-delta-same-method-no-verbessert',
    largeDelta.comparable &&
      largeDelta.verdict === 'measurable_delta' &&
      largeDelta.method === 'max_extension' &&
      !IMPROVED.test(largeDelta.headline + largeDelta.detail) &&
      (largeDelta.targetBandNote == null || largeDelta.targetBandNote.includes('keine Aussage über Komfort')),
    largeDelta.headline,
  )

  const inBand = compareDocumentedChange({
    change: {
      ...change,
      previous: {
        ...beforeSnap,
        profileReleased: true,
        ruleId: 'released-fixture',
        targetLowDeg: 25,
        targetHighDeg: 39,
        valueDeg: 50,
      },
    },
    after: {
      ...afterSnap,
      profileReleased: true,
      ruleId: 'released-fixture',
      targetLowDeg: 25,
      targetHighDeg: 39,
      valueDeg: 32,
    },
  })
  check(
    cases,
    'target-band-is-not-comfort-or-injury-claim',
    inBand.targetBandNote === CHANGE_COPY.targetBandReached &&
      inBand.targetBandNote.includes('Komfort') &&
      inBand.targetBandNote.includes('Verletzungsfreiheit') &&
      !IMPROVED.test(inBand.targetBandNote),
    inBand.targetBandNote ?? 'none',
  )

  const sameClip = attachChangeLoop({
    pending: change,
    afterResult,
    afterSnapshot: { ...afterSnap, captureId: 'cap-a' },
  })
  check(
    cases,
    'reanalyze-same-clip-does-not-attach-compare',
    sameClip.changeLink === undefined,
    sameClip.changeLink ? 'attached' : 'skipped',
  )

  check(
    cases,
    'keep-review-do-not-force-document',
    canDocumentChange({
      entryPath: 'beginner',
      kind: 'keep',
      captureId: 'cap-a',
      observation: beforeObs,
      releasedAdjust: false,
    }) &&
      canDocumentChange({
        entryPath: 'beginner',
        kind: 'review',
        captureId: 'cap-a',
        observation: beforeObs,
        releasedAdjust: false,
      }) &&
      !documentPathProminent('keep', false) &&
      !documentPathProminent('review', false) &&
      !canDocumentChange({
        entryPath: 'beginner',
        kind: 'retake',
        captureId: 'cap-a',
        observation: beforeObs,
        releasedAdjust: false,
      }),
    'optional for keep/review, hidden for retake',
  )

  const r2 = decideAction({
    captureId: 'cap-r2',
    analysisId: 'an-r2',
    method: 'bottom_dead_center',
    valueDeg: 50,
    uncertaintyDeg: 1,
    cycles: 12,
    kneePresent: true,
    qualityLevel: 'ok',
    profile: matchingRuleProfile('knee_flexion', 'bottom_dead_center'),
    evidenceIds: ['phase:bdc'],
  })
  const r2Action = decideFromObservation(beforeObs)
  check(
    cases,
    'ap10-r2-still-no-beginner-seat',
    r2.kind === 'review' &&
      r2.parameter === null &&
      r2.direction === null &&
      !beginnerSeatAction(r2) &&
      r2Action.kind !== 'adjust' &&
      !beginnerSeatAction(r2Action),
    `${r2.kind}/${r2Action.kind}`,
  )

  const parsed = parseChangeLink(linked.changeLink)
  check(
    cases,
    'change-link-roundtrip',
    parsed.ok &&
      parsed.value?.previousCaptureId === 'cap-a' &&
      parsed.value.nextCaptureId === 'cap-b' &&
      parsed.value.comparison.verdict === compatible.verdict,
    parsed.ok ? parsed.value?.kind ?? 'ok' : parsed.reason,
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `CHANGE_HARNESS_OK — ${cases.length} checks`
        : `CHANGE_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
