import { computePixelBikeTransform } from '../calibration/transform.ts'
import {
  SYNTHETIC_MARKS,
  syntheticCrankAngleDeg,
  syntheticPedalPixel,
} from '../camera/synthetic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { POSE_LANDMARK } from '../types/landmarks.ts'
import type { MetricsFrame, MetricsReport } from '../types/metrics.ts'
import type { PedalSample, PedalTrackStatus } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { createMeasurementCapture } from './capture.ts'
import { BDC_ANGLE_DEG, BDC_WINDOW_HALF_DEG, estimateAtBdc } from './bdc.ts'
import {
  computeMetricsReport,
  DEFAULT_METRICS_OPTIONS,
  metricsReportComputeCount,
  resetMetricsReportComputeCount,
} from './pipeline.ts'

export type MetricsHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type MetricsHarnessResult = {
  passed: boolean
  cases: MetricsHarnessCase[]
  message: string
}

const FPS = 30
const DT_MS = 1000 / FPS
const RPM = 80
const MS_PER_REV = (60 / RPM) * 1000

const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

if (!TRANSFORM) {
  throw new Error('Synthetic B/S/G must produce a pixel↔bike transform.')
}

function lockedPedal(timestampMs: number): PedalSample {
  const angle = syntheticCrankAngleDeg(timestampMs)
  return {
    timestampMs,
    pixel: syntheticPedalPixel(timestampMs),
    crankAngleDeg: angle,
    phase01: angle / 360,
    revolutions: Math.floor(timestampMs / MS_PER_REV),
    status: 'locked',
    lostFrames: 0,
  }
}

function pedalWithStatus(timestampMs: number, status: PedalTrackStatus): PedalSample {
  if (status === 'locked') return lockedPedal(timestampMs)
  return {
    timestampMs,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status,
    lostFrames: status === 'lost' ? 13 : 0,
  }
}

function hideElbow(pose: PoseFrame): PoseFrame {
  const hide = new Set<number>([
    POSE_LANDMARK.LEFT_ELBOW,
    POSE_LANDMARK.RIGHT_ELBOW,
    POSE_LANDMARK.LEFT_WRIST,
    POSE_LANDMARK.RIGHT_WRIST,
  ])
  return {
    ...pose,
    landmarks: pose.landmarks.map((lm, i) => (hide.has(i) ? { ...lm, visibility: 0.08 } : lm)),
  }
}

function hideKnee(pose: PoseFrame): PoseFrame {
  const hide = new Set<number>([POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.RIGHT_KNEE])
  return {
    ...pose,
    landmarks: pose.landmarks.map((lm, i) => (hide.has(i) ? { ...lm, visibility: 0.05 } : lm)),
  }
}

/**
 * Time-varying knee: extended at BDC, flexed at TDC.
 * Cycle-mean and BDC must disagree — that is the Auftrag 1 fixture.
 */
function timeVaryingKneePose(timestampMs: number): PoseFrame {
  const pose = syntheticPoseFrame(timestampMs)
  const angle = syntheticCrankAngleDeg(timestampMs)
  const hip = pose.landmarks[POSE_LANDMARK.RIGHT_HIP]!
  const ankle = pose.landmarks[POSE_LANDMARK.RIGHT_ANKLE]!
  const w = 0.5 * (1 - Math.cos((angle * Math.PI) / 180))
  const midX = (hip.x + ankle.x) / 2
  const midY = (hip.y + ankle.y) / 2
  const dx = ankle.x - hip.x
  const dy = ankle.y - hip.y
  const px = -dy
  const py = dx
  const plen = Math.hypot(px, py) || 1
  const offset = 0.07 * (1 - w)
  const landmarks = pose.landmarks.map((lm, i) => {
    if (i !== POSE_LANDMARK.RIGHT_KNEE) return lm
    return {
      ...lm,
      x: midX + (px / plen) * offset,
      y: midY + (py / plen) * offset,
      visibility: 0.96,
    }
  })
  return { ...pose, landmarks }
}

function collectFrames(
  revs: number,
  pedalAt: (t: number) => PedalSample,
  poseAt: (t: number) => PoseFrame | null,
  startMs = 0,
): MetricsFrame[] {
  const durationMs = revs * MS_PER_REV + DT_MS
  const frames: MetricsFrame[] = []
  for (let t = 0; t <= durationMs; t += DT_MS) {
    const timestampMs = startMs + t
    frames.push({
      timestampMs,
      pose: poseAt(timestampMs),
      pedal: pedalAt(timestampMs),
      transform: TRANSFORM,
    })
  }
  return frames
}

function caseResult(name: string, passed: boolean, detail: string): MetricsHarnessCase {
  return { name, passed, detail }
}

function inRange(value: number, lo: number, hi: number): boolean {
  return Number.isFinite(value) && value >= lo && value <= hi
}

function happyPath(): MetricsHarnessCase {
  const frames = collectFrames(8, lockedPedal, syntheticPoseFrame)
  const report = computeMetricsReport(frames)
  const knee = report.metrics.kneeFlexion
  const meanKnee = report.metrics.kneeFlexionCycleMean
  const trunk = report.metrics.trunkTorso
  const elbow = report.metrics.elbow
  const ok =
    report.validRevolutions >= 6 &&
    knee.quality === 'ok' &&
    meanKnee.quality === 'ok' &&
    trunk.quality === 'ok' &&
    elbow.quality === 'ok' &&
    knee.method === 'bottom_dead_center' &&
    meanKnee.method === 'cycle_mean' &&
    knee.unit === 'deg' &&
    knee.degrees !== null &&
    meanKnee.degrees !== null &&
    trunk.degrees !== null &&
    elbow.degrees !== null &&
    knee.usableCycles === knee.degrees.n &&
    inRange(knee.degrees.mean, 0, 180) &&
    inRange(trunk.degrees.mean, 0, 180) &&
    inRange(elbow.degrees.mean, 0, 180) &&
    knee.reasons.length === 0
  return caseResult(
    'valid-cycles-aggregate',
    ok,
    `revs=${report.validRevolutions} knee=${knee.quality}/${knee.method} mean=${meanKnee.method} n=${knee.usableCycles}`,
  )
}

function phaseLoss(): MetricsHarnessCase {
  const lostAfter = 1.2 * MS_PER_REV
  const frames = collectFrames(4, (t) => {
    if (t >= lostAfter) return pedalWithStatus(t, 'lost')
    return lockedPedal(t)
  }, syntheticPoseFrame)
  const report = computeMetricsReport(frames)
  const knee = report.metrics.kneeFlexion
  const hasPhase = knee.reasons.includes('phase_loss') || knee.reasons.includes('too_few_cycles')
  const ok =
    report.validRevolutions < DEFAULT_METRICS_OPTIONS.minValidCycles &&
    knee.quality === 'unavailable' &&
    knee.degrees === null &&
    knee.method === 'bottom_dead_center' &&
    hasPhase
  return caseResult(
    'phase-loss-excluded',
    ok,
    `revs=${report.validRevolutions} quality=${knee.quality} reasons=${knee.reasons.join(',')}`,
  )
}

function visibilityLoss(): MetricsHarnessCase {
  const frames = collectFrames(8, lockedPedal, (t) => hideElbow(syntheticPoseFrame(t)))
  const report = computeMetricsReport(frames)
  const elbow = report.metrics.elbow
  const knee = report.metrics.kneeFlexion
  const ok =
    report.validRevolutions >= 6 &&
    knee.quality === 'ok' &&
    elbow.quality === 'unavailable' &&
    elbow.degrees === null &&
    elbow.method === 'cycle_mean' &&
    elbow.reasons.includes('visibility') &&
    !elbow.reasons.includes('phase_loss')
  return caseResult(
    'elbow-visibility-unavailable',
    ok,
    `revs=${report.validRevolutions} knee=${knee.quality} elbow=${elbow.quality} reasons=${elbow.reasons.join(',')}`,
  )
}

function briefLockedMisses(): MetricsHarnessCase {
  const frames = collectFrames(8, (t) => {
    const i = Math.round(t / DT_MS)
    if (i > 8 && i % 12 === 0) {
      return {
        ...lockedPedal(t),
        pixel: null,
        crankAngleDeg: null,
        phase01: null,
      }
    }
    return lockedPedal(t)
  }, syntheticPoseFrame)
  const report = computeMetricsReport(frames)
  const ok =
    report.validRevolutions >= 6 &&
    report.metrics.kneeFlexion.quality === 'ok' &&
    report.metrics.elbow.quality === 'ok'
  return caseResult(
    'brief-locked-misses',
    ok,
    `revs=${report.validRevolutions} knee=${report.metrics.kneeFlexion.quality}`,
  )
}

function tooFewCycles(): MetricsHarnessCase {
  const frames = collectFrames(1.2, lockedPedal, syntheticPoseFrame)
  const report = computeMetricsReport(frames)
  const ids = ['kneeFlexion', 'kneeFlexionCycleMean', 'trunkTorso', 'elbow'] as const
  const allUnavailable = ids.every((id) => {
    const m = report.metrics[id]
    return m.quality === 'unavailable' && m.degrees === null && m.reasons.includes('too_few_cycles')
  })
  const ok = report.validRevolutions < DEFAULT_METRICS_OPTIONS.minValidCycles && allUnavailable
  return caseResult(
    'too-few-cycles',
    ok,
    `revs=${report.validRevolutions} reasons=${report.metrics.kneeFlexion.reasons.join(',')}`,
  )
}

function bdcVsCycleMean(): MetricsHarnessCase {
  const frames = collectFrames(8, lockedPedal, timeVaryingKneePose)
  const report = computeMetricsReport(frames)
  const bdc = report.metrics.kneeFlexion
  const cycleMean = report.metrics.kneeFlexionCycleMean
  const delta =
    bdc.degrees && cycleMean.degrees ? Math.abs(bdc.degrees.median - cycleMean.degrees.median) : 0
  const ok =
    report.validRevolutions >= 6 &&
    bdc.quality === 'ok' &&
    cycleMean.quality === 'ok' &&
    bdc.method === 'bottom_dead_center' &&
    cycleMean.method === 'cycle_mean' &&
    bdc.unit === 'deg' &&
    bdc.degrees !== null &&
    cycleMean.degrees !== null &&
    delta > 2 &&
    bdc.usableCycles === bdc.degrees.n &&
    cycleMean.usableCycles === cycleMean.degrees.n
  return caseResult(
    'a1-bdc-vs-cycle-mean',
    ok,
    `bdc=${bdc.degrees?.median.toFixed(1)} (${bdc.method}) mean=${cycleMean.degrees?.median.toFixed(1)} (${cycleMean.method}) Δ=${delta.toFixed(1)}`,
  )
}

function bdcWindowDocumented(): MetricsHarnessCase {
  const lerp = estimateAtBdc(
    [
      { angleDeg: 170, valueDeg: 20 },
      { angleDeg: 190, valueDeg: 40 },
    ],
    { bdcAngleDeg: BDC_ANGLE_DEG, bdcWindowHalfDeg: BDC_WINDOW_HALF_DEG },
  )
  const outside = estimateAtBdc(
    [
      { angleDeg: 40, valueDeg: 80 },
      { angleDeg: 90, valueDeg: 75 },
    ],
    { bdcAngleDeg: BDC_ANGLE_DEG, bdcWindowHalfDeg: BDC_WINDOW_HALF_DEG },
  )
  const ok =
    lerp !== null &&
    lerp.interpolation === 'lerp' &&
    Math.abs(lerp.valueDeg - 30) < 0.01 &&
    lerp.windowHalfDeg === 12 &&
    outside === null
  return caseResult(
    'a1-bdc-window-interpolation',
    ok,
    `lerp=${lerp?.valueDeg} interp=${lerp?.interpolation} outside=${outside}`,
  )
}

function tenRevsHiddenKnee(): MetricsHarnessCase {
  const frames = collectFrames(10, lockedPedal, (t) => hideKnee(syntheticPoseFrame(t)))
  const report = computeMetricsReport(frames)
  const knee = report.metrics.kneeFlexion
  const ok =
    report.validRevolutions >= 9 &&
    report.tracking.validRevolutions === report.validRevolutions &&
    report.tracking.quality === 'ok' &&
    knee.quality === 'unavailable' &&
    knee.usableCycles === 0 &&
    knee.method === 'bottom_dead_center' &&
    (knee.reasons.includes('visibility') || knee.reasons.includes('too_few_cycles'))
  return caseResult(
    'a6-ten-revs-hidden-knee',
    ok,
    `revs=${report.validRevolutions} tracking=${report.tracking.quality} knee=${knee.quality} n=${knee.usableCycles} reasons=${knee.reasons.join(',')}`,
  )
}

function tenPedalThreeKnee(): MetricsHarnessCase {
  const frames = collectFrames(10, lockedPedal, (t) =>
    t < 3 * MS_PER_REV ? syntheticPoseFrame(t) : hideKnee(syntheticPoseFrame(t)),
  )
  const report = computeMetricsReport(frames)
  const knee = report.metrics.kneeFlexion
  const ok =
    report.validRevolutions >= 9 &&
    knee.usableCycles >= 2 &&
    knee.usableCycles <= 4 &&
    knee.usableCycles !== report.validRevolutions &&
    (knee.degrees === null || knee.degrees.n === knee.usableCycles)
  return caseResult(
    'a6-ten-pedal-three-knee-usable',
    ok,
    `pedal=${report.validRevolutions} kneeUsable=${knee.usableCycles} quality=${knee.quality}`,
  )
}

function midCycleStartDiscarded(): MetricsHarnessCase {
  const frames = collectFrames(4, lockedPedal, syntheticPoseFrame, 0.25 * MS_PER_REV)
  const report = computeMetricsReport(frames)
  const fromZero = computeMetricsReport(collectFrames(4, lockedPedal, syntheticPoseFrame, 0))
  const ok = report.validRevolutions <= fromZero.validRevolutions && report.validRevolutions >= 2
  return caseResult(
    'a2-leading-partial-not-full-cycle',
    ok,
    `midStart=${report.validRevolutions} fromTdc=${fromZero.validRevolutions}`,
  )
}

function captureBoundaries(): MetricsHarnessCase {
  let now = 0
  const cap = createMeasurementCapture({
    targetRevs: 10,
    countdownSeconds: 3,
    now: () => now,
    idFactory: () => `id-${now}`,
  })
  const setup = collectFrames(20, lockedPedal, syntheticPoseFrame)
  for (const frame of setup) cap.push(frame)
  const afterSetup = cap.snapshot()
  cap.startCountdown(now)
  for (const frame of setup) cap.push(frame)
  now = 800
  cap.tick(now)
  const at800 = cap.snapshot()
  now = 2999
  cap.tick(now)
  const beforeEnd = cap.snapshot()
  now = 3000
  cap.tick(now)
  const recording = cap.snapshot()
  const afterCountdown = recording.report.validRevolutions

  const rec5 = collectFrames(5, lockedPedal, syntheticPoseFrame, 4000)
  for (const frame of rec5) cap.push(frame)
  const afterFive = cap.snapshot()
  const fiveRevs = afterFive.report.validRevolutions

  cap.startCountdown(now)
  now = 6000
  cap.tick(now)
  const restarted = cap.snapshot()

  const ok =
    afterSetup.state === 'ready' &&
    afterSetup.report.validRevolutions === 0 &&
    at800.state === 'countdown' &&
    at800.countdownRemainingSec > 2 &&
    beforeEnd.state === 'countdown' &&
    recording.state === 'recording' &&
    afterCountdown === 0 &&
    fiveRevs >= 4 &&
    fiveRevs <= 5 &&
    restarted.state === 'recording' &&
    restarted.report.validRevolutions === 0 &&
    restarted.report.frames === 0 &&
    Boolean(recording.id)
  return caseResult(
    'a2-setup-revs-ignored-and-restart-zero',
    ok,
    `setup=${afterSetup.report.validRevolutions} @800=${at800.state}/${at800.countdownRemainingSec.toFixed(2)}s rec=${afterCountdown} after5=${fiveRevs} restart=${restarted.report.validRevolutions}`,
  )
}

function captureFreezeAtomic(): MetricsHarnessCase {
  const cap = createMeasurementCapture({
    targetRevs: 6,
    countdownSeconds: 1,
    now: () => 1000,
  })
  cap.startCountdown(0)
  cap.tick(1000)
  const frames = collectFrames(10, lockedPedal, syntheticPoseFrame)
  for (const frame of frames) cap.push(frame)
  const frozen = cap.snapshot()
  const extra = collectFrames(4, lockedPedal, syntheticPoseFrame, 20_000)
  for (const frame of extra) cap.push(frame)
  const after = cap.snapshot()
  const n = frozen.report.metrics.kneeFlexion.usableCycles
  const ok =
    frozen.state === 'finished' &&
    frozen.frozen &&
    frozen.report.validRevolutions === 6 &&
    after.report.validRevolutions === 6 &&
    after.report.metrics.kneeFlexion.usableCycles === n &&
    after.id === frozen.id
  return caseResult(
    'a2-freeze-at-target-revs',
    ok,
    `state=${frozen.state} revs=${frozen.report.validRevolutions} n=${n} after=${after.report.validRevolutions}`,
  )
}

function captureAbortStopsFrames(): MetricsHarnessCase {
  let now = 0
  const cap = createMeasurementCapture({
    targetRevs: 10,
    countdownSeconds: 3,
    now: () => now,
    idFactory: () => `abort-${now}`,
  })
  cap.startCountdown(0)
  now = 1000
  cap.tick(now)
  const duringCountdown = cap.snapshot()
  const aborted = cap.abort('aborted')
  const afterAbortFrames = collectFrames(4, lockedPedal, syntheticPoseFrame, 2000)
  for (const frame of afterAbortFrames) cap.push(frame)
  const afterPush = cap.snapshot()
  cap.reset()
  const resetSnap = cap.snapshot()
  cap.startCountdown(8000)
  now = 11000
  const restarted = cap.tick(now)
  const ok =
    duringCountdown.state === 'countdown' &&
    aborted.state === 'aborted' &&
    aborted.abortReason === 'aborted' &&
    afterPush.state === 'aborted' &&
    afterPush.report.validRevolutions === 0 &&
    afterPush.report.frames === 0 &&
    !afterPush.frozen &&
    resetSnap.state === 'ready' &&
    resetSnap.id === null &&
    restarted.state === 'recording' &&
    restarted.report.validRevolutions === 0 &&
    restarted.report.frames === 0
  return caseResult(
    'abort-leave-blocks-frames-and-restarts-zero',
    ok,
    `cd=${duringCountdown.state} abort=${aborted.state} push=${afterPush.report.frames} restart=${restarted.state}/${restarted.report.validRevolutions}`,
  )
}

function captureRecordingComputesOnce(): MetricsHarnessCase {
  const frames = collectFrames(6, lockedPedal, syntheticPoseFrame, 4000)
  const cap = createMeasurementCapture({
    targetRevs: 20,
    countdownSeconds: 1,
    now: () => 1000,
  })
  cap.startCountdown(0)
  cap.tick(1000)
  resetMetricsReportComputeCount()
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  for (const frame of frames) {
    cap.snapshot()
    cap.push(frame)
    cap.snapshot()
  }
  const elapsedMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  const computes = metricsReportComputeCount()
  const perFrame = computes / frames.length
  const last = cap.snapshot()
  const ok = computes === frames.length && last.report.validRevolutions >= 5
  return caseResult(
    'recording-push-computes-report-once',
    ok,
    `frames=${frames.length} computes=${computes} perFrame=${perFrame.toFixed(2)} ${elapsedMs.toFixed(1)}ms revs=${last.report.validRevolutions}`,
  )
}

export function summarizeReport(report: MetricsReport): string {
  const parts = (['kneeFlexion', 'kneeFlexionCycleMean', 'trunkTorso', 'elbow'] as const).map((id) => {
    const m = report.metrics[id]
    if (m.quality === 'ok' && m.degrees) {
      return `${id}:${m.method}=${m.degrees.median.toFixed(1)}°n${m.usableCycles}`
    }
    return `${id}:${m.method}=unavailable(${m.reasons.join('+')})`
  })
  return `${report.validRevolutions} valid revs · ${parts.join(' · ')}`
}

/** Synthetic cycle / quality / capture cases. VM-safe — no camera, no Ampel. */
export function runMetricsHarness(): MetricsHarnessResult {
  const cases = [
    happyPath(),
    phaseLoss(),
    visibilityLoss(),
    tooFewCycles(),
    briefLockedMisses(),
    bdcVsCycleMean(),
    bdcWindowDocumented(),
    tenRevsHiddenKnee(),
    tenPedalThreeKnee(),
    midCycleStartDiscarded(),
    captureBoundaries(),
    captureFreezeAtomic(),
    captureAbortStopsFrames(),
    captureRecordingComputesOnce(),
  ]
  const passed = cases.every((c) => c.passed)
  return {
    passed,
    cases,
    message: passed
      ? `Metrics harness passed — ${cases.length} cases. BDC + capture + quality.`
      : `Metrics harness failed — ${cases.filter((c) => !c.passed).map((c) => c.name).join(', ')}.`,
  }
}
