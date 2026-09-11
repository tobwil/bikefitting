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
import { computeMetricsReport, DEFAULT_METRICS_OPTIONS } from './pipeline.ts'

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

function collectFrames(
  revs: number,
  pedalAt: (t: number) => PedalSample,
  poseAt: (t: number) => PoseFrame | null,
): MetricsFrame[] {
  const durationMs = revs * MS_PER_REV + DT_MS
  const frames: MetricsFrame[] = []
  for (let t = 0; t <= durationMs; t += DT_MS) {
    frames.push({
      timestampMs: t,
      pose: poseAt(t),
      pedal: pedalAt(t),
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
  const trunk = report.metrics.trunkTorso
  const elbow = report.metrics.elbow
  const ok =
    report.validRevolutions >= 6 &&
    knee.quality === 'ok' &&
    trunk.quality === 'ok' &&
    elbow.quality === 'ok' &&
    knee.degrees !== null &&
    trunk.degrees !== null &&
    elbow.degrees !== null &&
    inRange(knee.degrees.mean, 0, 180) &&
    inRange(trunk.degrees.mean, 0, 180) &&
    inRange(elbow.degrees.mean, 0, 180) &&
    knee.reasons.length === 0
  return caseResult(
    'valid-cycles-aggregate',
    ok,
    `revs=${report.validRevolutions} knee=${knee.quality} trunk=${trunk.quality} elbow=${elbow.quality}`,
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
  const ids = ['kneeFlexion', 'trunkTorso', 'elbow'] as const
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

export function summarizeReport(report: MetricsReport): string {
  const parts = (['kneeFlexion', 'trunkTorso', 'elbow'] as const).map((id) => {
    const m = report.metrics[id]
    if (m.quality === 'ok' && m.degrees) {
      return `${id}=${m.degrees.median.toFixed(1)}°`
    }
    return `${id}=unavailable(${m.reasons.join('+')})`
  })
  return `${report.validRevolutions} valid revs · ${parts.join(' · ')}`
}

/** Synthetic cycle / quality cases. VM-safe — no camera, no Ampel. */
export function runMetricsHarness(): MetricsHarnessResult {
  const cases = [happyPath(), phaseLoss(), visibilityLoss(), tooFewCycles(), briefLockedMisses()]
  const passed = cases.every((c) => c.passed)
  return {
    passed,
    cases,
    message: passed
      ? `Metrics harness passed — ${cases.length} cases. Numeric + quality only.`
      : `Metrics harness failed — ${cases.filter((c) => !c.passed).map((c) => c.name).join(', ')}.`,
  }
}
