import { computePixelBikeTransform } from '../calibration/transform.ts'
import {
  SYNTHETIC_MARKS,
  syntheticCrankAngleDeg,
  syntheticPedalPixel,
} from '../camera/synthetic.ts'
import { computeMetricsReport } from '../metrics/pipeline.ts'
import { POSE_LANDMARK, type Landmark, type PoseFrame } from '../types/landmarks.ts'
import type { PedalSample } from '../types/pedal.ts'
import { applySeekReset } from '../file/seekReset.ts'
import { OneEuroFilter } from './vendor/casiez-oneeurofilter/OneEuroFilter.ts'
import {
  compareOverlayKnees,
  filterPoseSeries,
  metricsFramesFromPoses,
  reportOverlayDelay,
} from './overlayEval.ts'
import {
  OverlayPoseFilter,
  overlayFilterFromSearch,
  poseForMetrics,
} from './overlayFilter.ts'
import { MeasureSideLock } from './measureSideLock.ts'
import { syntheticPoseFrame } from './syntheticLandmarks.ts'
import { inferNearSide } from './nearSide.ts'

export type OverlayHarnessCase = { name: string; passed: boolean; detail: string }
export type OverlayHarnessResult = { passed: boolean; cases: OverlayHarnessCase[]; message: string }

const RPM = 80
const MS_PER_REV = (60 / RPM) * 1000
const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

if (!TRANSFORM) throw new Error('overlay harness needs fixture B/S/G')

function check(name: string, passed: boolean, detail: string): OverlayHarnessCase {
  return { name, passed, detail }
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

function hideIndex(pose: PoseFrame, index: number): PoseFrame {
  return {
    ...pose,
    landmarks: pose.landmarks.map((lm, i) =>
      i === index ? { ...lm, visibility: 0.04, x: 0.12, y: 0.88 } : lm,
    ),
  }
}

function swapNearSide(pose: PoseFrame): PoseFrame {
  const landmarks = pose.landmarks.map((lm) => ({ ...lm }))
  const pairs: Array<[number, number]> = [
    [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.RIGHT_SHOULDER],
    [POSE_LANDMARK.LEFT_ELBOW, POSE_LANDMARK.RIGHT_ELBOW],
    [POSE_LANDMARK.LEFT_WRIST, POSE_LANDMARK.RIGHT_WRIST],
    [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.RIGHT_HIP],
    [POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.RIGHT_KNEE],
    [POSE_LANDMARK.LEFT_ANKLE, POSE_LANDMARK.RIGHT_ANKLE],
    [POSE_LANDMARK.LEFT_HEEL, POSE_LANDMARK.RIGHT_HEEL],
    [POSE_LANDMARK.LEFT_FOOT_INDEX, POSE_LANDMARK.RIGHT_FOOT_INDEX],
  ]
  for (const [left, right] of pairs) {
    const a = landmarks[left]
    const b = landmarks[right]
    if (!a || !b) continue
    landmarks[left] = b
    landmarks[right] = a
  }
  return { ...pose, landmarks, nearSide: 'left' }
}

function hideSide(pose: PoseFrame, side: 'left' | 'right'): PoseFrame {
  const hide = new Set<number>(
    side === 'left'
      ? [
          POSE_LANDMARK.LEFT_SHOULDER,
          POSE_LANDMARK.LEFT_ELBOW,
          POSE_LANDMARK.LEFT_WRIST,
          POSE_LANDMARK.LEFT_HIP,
          POSE_LANDMARK.LEFT_KNEE,
          POSE_LANDMARK.LEFT_ANKLE,
          POSE_LANDMARK.LEFT_HEEL,
          POSE_LANDMARK.LEFT_FOOT_INDEX,
        ]
      : [
          POSE_LANDMARK.RIGHT_SHOULDER,
          POSE_LANDMARK.RIGHT_ELBOW,
          POSE_LANDMARK.RIGHT_WRIST,
          POSE_LANDMARK.RIGHT_HIP,
          POSE_LANDMARK.RIGHT_KNEE,
          POSE_LANDMARK.RIGHT_ANKLE,
          POSE_LANDMARK.RIGHT_HEEL,
          POSE_LANDMARK.RIGHT_FOOT_INDEX,
        ],
  )
  return {
    ...pose,
    landmarks: pose.landmarks.map((lm, i) => (hide.has(i) ? { ...lm, visibility: 0.05 } : lm)),
    nearSide: undefined,
  }
}

function noisyKnee(pose: PoseFrame, seed: number): PoseFrame {
  const wobble = 0.012 * Math.sin(seed * 17.3) + 0.008 * Math.sin(seed * 31.1)
  const landmarks = pose.landmarks.map((lm, i) => {
    if (i !== POSE_LANDMARK.RIGHT_KNEE) return lm
    return { ...lm, x: lm.x + wobble, y: lm.y - wobble * 0.6 }
  })
  return { ...pose, landmarks }
}

/** Irregular dt — proves we are not a fixed 30 Hz sampler. */
function irregularTimes(revs: number): number[] {
  const times: number[] = []
  let t = 0
  const end = revs * MS_PER_REV
  let step = 0
  while (t <= end) {
    times.push(t)
    const pattern = [18, 41, 27, 33, 22, 48]
    t += pattern[step % pattern.length]!
    step += 1
  }
  return times
}

function series(revs: number, map: (pose: PoseFrame, i: number) => PoseFrame): PoseFrame[] {
  return irregularTimes(revs).map((timestampMs, i) => map(syntheticPoseFrame(timestampMs), i))
}

export function runOverlayFilterHarness(): OverlayHarnessResult {
  const cases: OverlayHarnessCase[] = []

  const sameValues = [0.2, 0.35, 0.41, 0.38, 0.5]
  const fixed30 = new OneEuroFilter(30, 1.0, 0.1, 1.0)
  const timed = new OneEuroFilter(60, 1.0, 0.1, 1.0)
  const out30: number[] = []
  const outTs: number[] = []
  sameValues.forEach((value, i) => {
    out30.push(fixed30.filter(value, i / 30))
    outTs.push(timed.filter(value, [0, 0.04, 0.11, 0.13, 0.22][i]))
  })
  const tsDiffers = outTs.some((value, i) => Math.abs(value - out30[i]!) > 1e-6)
  cases.push(
    check(
      'Casiez 1€ uses timestamps, not a fixed 30 Hz clock',
      tsDiffers,
      `dt30=${out30[out30.length - 1]?.toFixed(4)} dtTs=${outTs[outTs.length - 1]?.toFixed(4)}`,
    ),
  )

  cases.push(
    check(
      'overlayFilter URL is opt-in lab compare',
      overlayFilterFromSearch('') === false &&
        overlayFilterFromSearch('?profile=production') === false &&
        overlayFilterFromSearch('?overlayFilter=1') === true,
      'default off',
    ),
  )

  const raw = syntheticPoseFrame(1000)
  const filteredOnce = new OverlayPoseFilter().apply(raw).frame
  cases.push(
    check(
      'metrics helper always returns the raw pose',
      poseForMetrics(raw, filteredOnce) === raw && poseForMetrics(raw, filteredOnce)?.timestampMs === 1000,
      'raw wins',
    ),
  )

  const afterHold = new OverlayPoseFilter()
  afterHold.apply(syntheticPoseFrame(0))
  afterHold.apply(syntheticPoseFrame(80))
  afterHold.apply(syntheticPoseFrame(180))
  const missingKnee = hideIndex(syntheticPoseFrame(260), POSE_LANDMARK.RIGHT_KNEE)
  const missingOut = afterHold.apply(missingKnee)
  const rawKnee = missingKnee.landmarks[POSE_LANDMARK.RIGHT_KNEE]
  const outKnee = missingOut.frame?.landmarks[POSE_LANDMARK.RIGHT_KNEE]
  cases.push(
    check(
      'missing joints stay missing — no invented visibility or intermediates',
      Boolean(
        rawKnee &&
          outKnee &&
          outKnee.visibility === rawKnee.visibility &&
          outKnee.visibility < 0.75 &&
          outKnee.x === rawKnee.x &&
          outKnee.y === rawKnee.y,
      ),
      `vis=${outKnee?.visibility} xy=${outKnee?.x},${outKnee?.y}`,
    ),
  )

  const gapFilter = new OverlayPoseFilter()
  const beforeLoss = gapFilter.apply(syntheticPoseFrame(0)).frame
  const afterLoss = gapFilter.apply(syntheticPoseFrame(1200))
  const firstAfterReset = afterLoss.frame?.landmarks[POSE_LANDMARK.RIGHT_KNEE]
  const rawAfter = syntheticPoseFrame(1200).landmarks[POSE_LANDMARK.RIGHT_KNEE]
  cases.push(
    check(
      'pose-loss gap resets the filter (first sample after loss is raw)',
      Boolean(
        beforeLoss &&
          firstAfterReset &&
          rawAfter &&
          Math.abs(firstAfterReset.x - rawAfter.x) < 1e-12 &&
          afterLoss.lockedSide === null,
      ),
      `locked=${afterLoss.lockedSide}`,
    ),
  )

  let overlayResets = 0
  applySeekReset(
    {
      resetPedalTemporal() {},
      resetMetrics() {},
      resetCaptureAggregators() {},
      resetOverlayFilter: () => {
        overlayResets += 1
      },
    },
    400,
    1800,
  )
  cases.push(
    check('seek reset sink clears the overlay filter', overlayResets === 1, `resets=${overlayResets}`),
  )

  const lock = new OverlayPoseFilter()
  lock.apply(syntheticPoseFrame(0))
  lock.apply(syntheticPoseFrame(80))
  lock.apply(syntheticPoseFrame(180))
  const locked = lock.apply(syntheticPoseFrame(200))
  const flipped = hideSide(swapNearSide(syntheticPoseFrame(260)), 'right')
  const conflict = lock.apply(flipped)
  const inferred = inferNearSide(flipped.landmarks, 0.75)
  cases.push(
    check(
      'side occlusion does not silently switch the locked L/R chain',
      locked.lockedSide === 'right' &&
        conflict.lockedSide === 'right' &&
        conflict.needsNewTake === true &&
        conflict.occludedNearSide === true &&
        inferred === 'left' &&
        conflict.frame?.nearSide === 'right',
      `lock=${conflict.lockedSide} infer=${inferred} newTake=${conflict.needsNewTake}`,
    ),
  )

  const noisy = series(6, (pose, i) => noisyKnee(pose, i + 1))
  const pairs = filterPoseSeries(noisy)
  const samples = pairs.map(({ raw: r, filtered }) => compareOverlayKnees(r, filtered, TRANSFORM))
  const delay = reportOverlayDelay(samples)
  const invented = pairs.some(({ raw: r, filtered }) => {
    if (!filtered) return false
    return r.landmarks.some((lm, i) => {
      const out = filtered.landmarks[i] as Landmark | undefined
      return (lm.visibility ?? 0) < 0.75 && (out?.visibility ?? 0) >= 0.75
    })
  })
  delay.inventedVisibility = invented

  const rawReport = computeMetricsReport(metricsFramesFromPoses(noisy, lockedPedal, TRANSFORM))
  const filteredPoses = pairs.map((p) => p.filtered).filter((p): p is PoseFrame => p !== null)
  const filteredReport = computeMetricsReport(metricsFramesFromPoses(filteredPoses, lockedPedal, TRANSFORM))
  const rawBdc = rawReport.metrics.kneeFlexion.degrees?.mean ?? null
  const filteredBdc = filteredReport.metrics.kneeFlexion.degrees?.mean ?? null
  const bdcShift =
    rawBdc !== null && filteredBdc !== null ? Math.abs(filteredBdc - rawBdc) : Number.POSITIVE_INFINITY
  const delayMs = delay.phaseDelayMs

  cases.push(
    check(
      'overlay jitter drops vs raw without inventing visibility',
      delay.jitterReduced && delay.inventedVisibility === false && delay.samples > 40,
      `rawRms=${delay.rawJitterRmsDeg.toFixed(3)} filtRms=${delay.filteredJitterRmsDeg.toFixed(3)} n=${delay.samples}`,
    ),
  )
  cases.push(
    check(
      'filtered overlay must not systematically shift BDC (eval only — metrics stay raw)',
      rawReport.metrics.kneeFlexion.quality === 'ok' &&
        filteredReport.metrics.kneeFlexion.quality === 'ok' &&
        bdcShift <= 2.0,
      `rawBdc=${rawBdc?.toFixed(2)} filtBdc=${filteredBdc?.toFixed(2)} shift=${bdcShift.toFixed(2)}°`,
    ),
  )
  cases.push(
    check(
      'phase delay vs unfiltered is measured before any metric use',
      delayMs !== null && Math.abs(delayMs) <= 80,
      `delayMs=${delayMs} mae=${delay.meanAbsAngleErrorDeg.toFixed(2)} max=${delay.maxAbsAngleErrorDeg.toFixed(2)}`,
    ),
  )
  cases.push(
    check(
      'product metrics path is the raw series, not the overlay',
      poseForMetrics(noisy[10] ?? null, filteredPoses[10] ?? null) === (noisy[10] ?? null),
      'poseForMetrics(raw)',
    ),
  )

  const runLock = (filterOn: boolean) => {
    const lock = new MeasureSideLock()
    const overlay = new OverlayPoseFilter()
    const sides: Array<string | undefined> = []
    const consume = (raw: PoseFrame) => {
      const draw = filterOn ? overlay.apply(raw).frame : raw
      const measure = lock.apply(poseForMetrics(raw, draw))
      if (measure.lockedSide) sides.push(measure.pose?.nearSide)
      return measure
    }
    consume(syntheticPoseFrame(0))
    consume(syntheticPoseFrame(80))
    consume(syntheticPoseFrame(180))
    consume(syntheticPoseFrame(200))
    const flipped = hideSide(swapNearSide(syntheticPoseFrame(260)), 'right')
    const conflict = consume(flipped)
    return { sides, conflict }
  }
  const lockOff = runLock(false)
  const lockOn = runLock(true)
  cases.push(
    check(
      'measure-side lock is independent of overlay filter on/off — no L/R mix',
      lockOff.sides.every((side) => side === 'right') &&
        lockOn.sides.every((side) => side === 'right') &&
        lockOff.conflict.needsNewTake === true &&
        lockOn.conflict.needsNewTake === true &&
        lockOff.conflict.pose?.nearSide === 'right' &&
        lockOn.conflict.pose?.nearSide === 'right',
      `off=${lockOff.sides.join(',')} on=${lockOn.sides.join(',')}`,
    ),
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `OVERLAY_FILTER_OK — ${cases.length} checks. Delay ${delayMs ?? '—'} ms, BDC shift ${Number.isFinite(bdcShift) ? bdcShift.toFixed(2) : '—'}°.`
        : `OVERLAY_FILTER_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
