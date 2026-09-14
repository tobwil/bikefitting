import { decideAction, beginnerSeatAction } from '../action/decide.ts'
import { matchingRuleProfile } from '../rules/catalog.ts'
import { presentMetricCard } from '../rules/metricCard.ts'
import { computeMetricsReport } from '../metrics/pipeline.ts'
import { SYNTHETIC_MARKS, syntheticCrankAngleDeg, syntheticPedalPixel } from '../camera/synthetic.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { MetricsFrame } from '../types/metrics.ts'
import type { PedalSample } from '../types/pedal.ts'
import {
  MARKERLESS_KNEE_METHOD,
  MARKERLESS_KNEE_METHOD_VERSION,
  markerlessToMetricsReport,
} from '../types/analysis.ts'
import { actionInputFromMarkerless } from './quality.ts'
import { observeKneeFromPoses, runMarkerlessJob } from './fromClip.ts'
import { buildMarkerlessFixtureClip, MARKERLESS_FIXTURE_MS_PER_REV } from './fixture.ts'
import { MARKERLESS_MIN_VALID_CYCLES } from './constants.ts'
import { readKneeObservation } from '../action/observation.ts'

export type AnalysisHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type AnalysisHarnessResult = {
  passed: boolean
  cases: AnalysisHarnessCase[]
  message: string
}

function assert(name: string, ok: boolean, detail: string): AnalysisHarnessCase {
  return { name, passed: ok, detail }
}

function lockedPedal(timestampMs: number): PedalSample {
  const angle = syntheticCrankAngleDeg(timestampMs)
  return {
    timestampMs,
    pixel: syntheticPedalPixel(timestampMs),
    crankAngleDeg: angle,
    phase01: angle / 360,
    revolutions: Math.floor(timestampMs / MARKERLESS_FIXTURE_MS_PER_REV),
    status: 'locked',
    lostFrames: 0,
  }
}

const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

if (!TRANSFORM) throw new Error('markerless harness needs synthetic B/S/G transform')

function asMetricsFrames(frames: readonly PoseFrame[]): MetricsFrame[] {
  return frames.map((pose) => ({
    timestampMs: pose.timestampMs,
    pose,
    pedal: lockedPedal(pose.timestampMs),
    transform: TRANSFORM,
  }))
}

const SEAT_DIRECTION = /sattel etwas (höher|tiefer)/i

export async function runAnalysisHarness(): Promise<AnalysisHarnessResult> {
  const cases: AnalysisHarnessCase[] = []

  const happy = buildMarkerlessFixtureClip({ revs: 13 })
  const happyJob = await runMarkerlessJob({
    jobId: 'job-happy',
    captureId: happy.captureId,
    clipId: happy.clipId,
    bytes: happy.bytes,
  })
  const happyReport = happyJob.report
  const happyKnee = happyReport?.knee
  cases.push(
    assert(
      'fixture-clip-bytes-replay-usable',
      happyJob.state === 'done' &&
        happyJob.failReason === null &&
        happyReport != null &&
        happyKnee?.method === MARKERLESS_KNEE_METHOD &&
        happyKnee.methodVersion === MARKERLESS_KNEE_METHOD_VERSION &&
        happyKnee.quality === 'ok' &&
        (happyKnee.usableCycles ?? 0) >= MARKERLESS_MIN_VALID_CYCLES &&
        happyKnee.degrees != null &&
        happyReport.phaseSource === 'motion_estimate' &&
        happyReport.qualityLevel === 'ok' &&
        happyJob.job.inputHash.length === 64,
      `state=${happyJob.state} n=${happyKnee?.usableCycles} method=${happyKnee?.method} q=${happyKnee?.quality}`,
    ),
  )

  const again = observeKneeFromPoses(happy.frames)
  cases.push(
    assert(
      'same-pose-series-is-reproducible',
      again.knee.degrees?.median === happyKnee?.degrees?.median &&
        again.knee.usableCycles === happyKnee?.usableCycles &&
        again.method === MARKERLESS_KNEE_METHOD,
      `a=${happyKnee?.degrees?.median} b=${again.knee.degrees?.median}`,
    ),
  )

  const still = buildMarkerlessFixtureClip({ revs: 6, freezePedal: true })
  const stillReport = observeKneeFromPoses(still.frames)
  cases.push(
    assert(
      'still-is-not-pedaling',
      stillReport.knee.quality === 'unavailable' &&
        stillReport.knee.degrees == null &&
        (stillReport.knee.reasons.includes('still') || stillReport.knee.reasons.includes('not_pedaling')) &&
        stillReport.knee.method === MARKERLESS_KNEE_METHOD,
      stillReport.knee.reasons.join(','),
    ),
  )

  const segmented = observeKneeFromPoses(
    buildMarkerlessFixtureClip({
      revs: 13,
      prefixStillMs: 1500,
      suffixStillMs: 1200,
      prefixMountMs: 800,
      suffixDismountMs: 800,
    }).frames,
  )
  cases.push(
    assert(
      'mount-dismount-still-excluded-uses-pedaling-island',
      segmented.knee.quality === 'ok' &&
        segmented.selectedSegment != null &&
        segmented.excludedSegments.some((seg) => seg.reason === 'still' || seg.reason === 'mount_dismount') &&
        segmented.knee.usableCycles >= MARKERLESS_MIN_VALID_CYCLES,
      `n=${segmented.knee.usableCycles} excluded=${segmented.excludedSegments.map((s) => s.reason).join(',')}`,
    ),
  )

  const hidden = observeKneeFromPoses(buildMarkerlessFixtureClip({ revs: 13, hideKnee: true }).frames)
  cases.push(
    assert(
      'missing-knee-is-unavailable',
      hidden.knee.quality === 'unavailable' &&
        hidden.knee.degrees == null &&
        hidden.knee.reasons.includes('missing_knee') &&
        hidden.qualityLevel === 'insufficient',
      hidden.knee.reasons.join(','),
    ),
  )

  const few = observeKneeFromPoses(buildMarkerlessFixtureClip({ revs: 4 }).frames)
  cases.push(
    assert(
      'four-cycles-is-too-few-for-beginner',
      few.knee.quality === 'unavailable' &&
        few.knee.degrees == null &&
        few.knee.reasons.includes('too_few_cycles') &&
        few.candidateCycles < MARKERLESS_MIN_VALID_CYCLES,
      `candidates=${few.candidateCycles} usable=${few.usableCycles} reasons=${few.knee.reasons.join(',')}`,
    ),
  )

  const disagree = observeKneeFromPoses(
    buildMarkerlessFixtureClip({ revs: 13, kneeMode: 'extended_at_tdc' }).frames,
  )
  const bdcFrames = asMetricsFrames(buildMarkerlessFixtureClip({ revs: 13, kneeMode: 'extended_at_tdc' }).frames)
  const bdcReport = computeMetricsReport(bdcFrames)
  const bdcKnee = bdcReport.metrics.kneeFlexion
  cases.push(
    assert(
      'max-extension-is-not-renamed-bdc',
      disagree.knee.method === MARKERLESS_KNEE_METHOD &&
        disagree.knee.methodVersion === MARKERLESS_KNEE_METHOD_VERSION &&
        bdcKnee.method === 'bottom_dead_center' &&
        disagree.knee.quality === 'ok' &&
        bdcKnee.quality === 'ok' &&
        disagree.knee.degrees != null &&
        bdcKnee.degrees != null &&
        Math.abs(disagree.knee.degrees.median - bdcKnee.degrees.median) > 2,
      `max_ext=${disagree.knee.degrees?.median} bdc=${bdcKnee.degrees?.median}`,
    ),
  )

  const like = markerlessToMetricsReport(happyReport!)
  const observed = readKneeObservation({ report: like })
  cases.push(
    assert(
      'metrics-report-like-keeps-max-extension',
      like.metrics.kneeFlexion.method === MARKERLESS_KNEE_METHOD &&
        observed.method === MARKERLESS_KNEE_METHOD &&
        observed.kneePresent &&
        like.metrics.kneeFlexionCycleMean.method !== MARKERLESS_KNEE_METHOD,
      `method=${like.metrics.kneeFlexion.method} obs=${observed.method}`,
    ),
  )

  const profile = matchingRuleProfile('knee_flexion', MARKERLESS_KNEE_METHOD)
  const bdcProfile = matchingRuleProfile('knee_flexion', 'bottom_dead_center')
  const action = decideAction(
    actionInputFromMarkerless(happyReport!, {
      captureId: happy.captureId,
      analysisId: happyJob.job.jobId,
    }),
  )
  cases.push(
    assert(
      'bdc-profile-does-not-auto-apply',
      profile == null &&
        bdcProfile?.method === 'bottom_dead_center' &&
        action.method === MARKERLESS_KNEE_METHOD &&
        action.kind === 'review' &&
        action.blockReasons.includes('markerless_not_released') &&
        !beginnerSeatAction(action) &&
        action.parameter == null &&
        !SEAT_DIRECTION.test(`${action.template.what} ${action.template.why}`),
      `profile=${profile?.id ?? 'null'} kind=${action.kind} reasons=${action.blockReasons.join(',')}`,
    ),
  )

  const hiddenAction = decideAction(
    actionInputFromMarkerless(hidden, { captureId: 'cap-hide', analysisId: 'job-hide' }),
  )
  cases.push(
    assert(
      'missing-knee-maps-to-action-retake',
      hiddenAction.kind === 'retake' &&
        hiddenAction.blockReasons.includes('missing_knee') &&
        hiddenAction.method === MARKERLESS_KNEE_METHOD,
      `kind=${hiddenAction.kind} reasons=${hiddenAction.blockReasons.join(',')}`,
    ),
  )

  const fewAction = decideAction(actionInputFromMarkerless(few, { captureId: 'cap-few', analysisId: 'job-few' }))
  cases.push(
    assert(
      'few-cycles-maps-to-action-insufficient',
      fewAction.kind === 'retake' &&
        (fewAction.blockReasons.includes('quality_insufficient') || fewAction.blockReasons.includes('missing_knee')) &&
        fewAction.report.valueDeg == null,
      `kind=${fewAction.kind} reasons=${fewAction.blockReasons.join(',')}`,
    ),
  )

  const card = presentMetricCard({
    id: 'knee_flexion',
    label: 'Kniebeugung nahe größter Streckung',
    value: happyKnee?.degrees?.median ?? null,
    method: MARKERLESS_KNEE_METHOD,
    usableCycles: happyKnee?.usableCycles ?? 0,
    spreadDeg: happyKnee?.degrees?.spread ?? null,
    qualityOk: true,
  })
  cases.push(
    assert(
      'metric-card-has-no-bdc-target-band',
      card.method === MARKERLESS_KNEE_METHOD &&
        card.band === 'unknown' &&
        card.bandView?.scoreable === false &&
        card.bandView?.profileId == null &&
        /größter Streckung/i.test(card.targetHint) &&
        !/tiefsten Pedalpunkt/i.test(card.targetHint),
      `hint=${card.targetHint} profile=${card.bandView?.profileId}`,
    ),
  )

  const evidenceBlob = JSON.stringify(happyReport?.evidence ?? [])
  cases.push(
    assert(
      'evidence-is-motion-state-not-bdc-phase',
      (happyReport?.evidence.length ?? 0) > 0 &&
        happyReport?.evidence.every((item) => item.kind === 'motion_state' && item.phaseSource === 'motion_estimate') ===
          true &&
        happyReport?.evidence.some((item) => item.label === 'near_max_extension') === true &&
        !/phase:bdc|"bdc"/i.test(evidenceBlob),
      `n=${happyReport?.evidence.length} ids=${happyReport?.evidence.map((e) => e.id).join(',')}`,
    ),
  )

  const cycle = happyReport?.cycles.find((item) => item.valid && item.p10FlexionDeg != null && item.rawMinFlexionDeg != null)
  cases.push(
    assert(
      'p10-is-not-claimed-as-single-frame-minimum',
      cycle != null &&
        cycle.p10FlexionDeg != null &&
        cycle.rawMinFlexionDeg != null &&
        cycle.p10FlexionDeg + 1e-9 >= cycle.rawMinFlexionDeg,
      `p10=${cycle?.p10FlexionDeg} min=${cycle?.rawMinFlexionDeg}`,
    ),
  )

  const webm = await runMarkerlessJob({
    jobId: 'job-webm',
    captureId: 'cap-webm',
    clipId: 'clip-webm',
    bytes: new TextEncoder().encode('webm-placeholder-not-a-decoder'),
    mimeType: 'video/webm',
  })
  cases.push(
    assert(
      'real-media-bytes-without-pose-need-ap03-decoder',
      webm.state === 'failed' && webm.failReason === 'decoder_required' && webm.report == null,
      `state=${webm.state} reason=${webm.failReason}`,
    ),
  )

  const fromPoses = await runMarkerlessJob({
    jobId: 'job-ap03',
    captureId: 'cap-ap03',
    clipId: 'clip-ap03',
    bytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'video/webm',
    poseFrames: happy.frames,
  })
  cases.push(
    assert(
      'ap03-pose-frames-on-clip-bytes-measure',
      fromPoses.state === 'done' &&
        fromPoses.report?.knee.method === MARKERLESS_KNEE_METHOD &&
        (fromPoses.report?.knee.usableCycles ?? 0) >= MARKERLESS_MIN_VALID_CYCLES,
      `state=${fromPoses.state} n=${fromPoses.report?.knee.usableCycles}`,
    ),
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `ANALYSIS_HARNESS_OK — ${cases.length} checks. method=${MARKERLESS_KNEE_METHOD} version=${MARKERLESS_KNEE_METHOD_VERSION}`
        : `ANALYSIS_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
