import { computePixelBikeTransform } from '../../calibration/transform.ts'
import { SYNTHETIC_MARKS } from '../../camera/synthetic.ts'
import { MIN_LANDMARK_VISIBILITY } from '../../config/defaults.ts'
import { sagittalJoints, sampleMetricDegrees } from '../../metrics/angles.ts'
import type { PedalSample } from '../../types/pedal.ts'
import { inferNearSide } from '../nearSide.ts'
import { POSE_LANDMARK, type Landmark, type PoseFrame } from '../../types/landmarks.ts'
import type { PoseDetectResult } from '../../types/pose-engine.ts'
import type {
  AngleDeltaReport,
  AngleDeltaStats,
  JointError,
  LandmarkErrorReport,
  PercentileStats,
  PoseCompareFrame,
  PoseModelRunStats,
} from '../../types/pose-compare.ts'
import type { PoseModelVariant } from '../../types/pose-engine.ts'
import { MEDIAPIPE_TASKS_VISION, POSE_MODEL_FILES } from '../../config/models.ts'

const COMPARE_JOINTS = [
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
] as const

const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx] ?? 0
}

export function percentileStats(values: number[]): PercentileStats {
  if (values.length === 0) return { n: 0, mean: 0, p50: 0, p95: 0 }
  const sum = values.reduce((acc, v) => acc + v, 0)
  return {
    n: values.length,
    mean: sum / values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  }
}

export function emptyRunStats(model: PoseModelVariant, initMs = 0): PoseModelRunStats {
  return {
    model,
    versionPath: POSE_MODEL_FILES[model].versionPath,
    packageVersion: MEDIAPIPE_TASKS_VISION,
    initMs,
    inference: { n: 0, mean: 0, p50: 0, p95: 0 },
    frames: 0,
    detectedFrames: 0,
    lostFrames: 0,
    missFrames: 0,
    timeoutFrames: 0,
    errorFrames: 0,
  }
}

export function accumulateRun(
  stats: PoseModelRunStats,
  result: PoseDetectResult,
  inferenceMs: number[],
): PoseFrame | null {
  stats.frames += 1
  if (result.status === 'frame') {
    stats.detectedFrames += 1
    if (typeof result.frame.inferenceMs === 'number') inferenceMs.push(result.frame.inferenceMs)
    return result.frame
  }
  stats.lostFrames += 1
  if (result.status === 'miss') stats.missFrames += 1
  else if (result.status === 'timeout') stats.timeoutFrames += 1
  else stats.errorFrames += 1
  return null
}

export function finalizeRun(stats: PoseModelRunStats, inferenceMs: number[]): PoseModelRunStats {
  stats.inference = percentileStats(inferenceMs)
  return stats
}

function visiblePair(
  a: Landmark | undefined,
  b: Landmark | undefined,
  minVis: number,
): [Landmark, Landmark] | null {
  if (!a || !b) return null
  if ((a.visibility ?? 0) < minVis || (b.visibility ?? 0) < minVis) return null
  return [a, b]
}

export function landmarkRmseNorm(
  a: Landmark[],
  b: Landmark[],
  minVis = MIN_LANDMARK_VISIBILITY,
): { rmseNorm: number; n: number } {
  let sum = 0
  let n = 0
  for (const name of COMPARE_JOINTS) {
    const pair = visiblePair(a[POSE_LANDMARK[name]], b[POSE_LANDMARK[name]], minVis)
    if (!pair) continue
    const dx = pair[0].x - pair[1].x
    const dy = pair[0].y - pair[1].y
    sum += dx * dx + dy * dy
    n += 1
  }
  if (n === 0) return { rmseNorm: 0, n: 0 }
  return { rmseNorm: Math.sqrt(sum / n), n }
}

export function perJointRmse(
  predicted: Landmark[][],
  truth: Landmark[][],
  minVis = MIN_LANDMARK_VISIBILITY,
): JointError[] {
  return COMPARE_JOINTS.map((joint) => {
    let sum = 0
    let n = 0
    const idx = POSE_LANDMARK[joint]
    for (let i = 0; i < predicted.length; i += 1) {
      const pair = visiblePair(predicted[i]?.[idx], truth[i]?.[idx], minVis)
      if (!pair) continue
      const dx = pair[0].x - pair[1].x
      const dy = pair[0].y - pair[1].y
      sum += dx * dx + dy * dy
      n += 1
    }
    return { joint, rmseNorm: n === 0 ? 0 : Math.sqrt(sum / n), n }
  })
}

function poseFromLandmarks(
  landmarks: Landmark[],
  frame: PoseCompareFrame,
  model?: PoseModelVariant,
): PoseFrame {
  return {
    timestampMs: frame.timestampMs,
    videoWidth: frame.width,
    videoHeight: frame.height,
    landmarks,
    engine: 'mediapipe',
    model,
    nearSide: inferNearSide(landmarks, MIN_LANDMARK_VISIBILITY),
  }
}

const IDLE_PEDAL: PedalSample = {
  timestampMs: 0,
  pixel: null,
  crankAngleDeg: null,
  phase01: null,
  revolutions: 0,
  status: 'idle',
  lostFrames: 0,
}

function angleFor(landmarks: Landmark[], frame: PoseCompareFrame, id: 'kneeFlexion' | 'trunkTorso' | 'elbow') {
  const pose = poseFromLandmarks(landmarks, frame)
  const joints = sagittalJoints(
    { timestampMs: frame.timestampMs, pose, pedal: IDLE_PEDAL, transform: TRANSFORM },
    MIN_LANDMARK_VISIBILITY,
  )
  if (!joints) return null
  return sampleMetricDegrees(joints, id)
}

function angleDeltaStats(values: number[]): AngleDeltaStats {
  if (values.length === 0) return { meanAbsDeg: null, p95AbsDeg: null, n: 0 }
  const abs = values.map((v) => Math.abs(v))
  const stats = percentileStats(abs)
  return { meanAbsDeg: stats.mean, p95AbsDeg: stats.p95, n: stats.n }
}

export function compareTracks(
  lite: Array<Landmark[] | null>,
  full: Array<Landmark[] | null>,
  frames: PoseCompareFrame[],
): { landmarkError: LandmarkErrorReport; angleDeltas: AngleDeltaReport } {
  const pairNorm: number[] = []
  let pairPx = 0
  const knee: number[] = []
  const trunk: number[] = []
  const elbow: number[] = []

  for (let i = 0; i < frames.length; i += 1) {
    const a = lite[i]
    const b = full[i]
    const frame = frames[i]
    if (!frame) continue
    if (a && b) {
      const rmse = landmarkRmseNorm(a, b)
      if (rmse.n > 0) {
        pairNorm.push(rmse.rmseNorm)
        pairPx += rmse.rmseNorm * Math.hypot(frame.width, frame.height)
      }
      const kA = angleFor(a, frame, 'kneeFlexion')
      const kB = angleFor(b, frame, 'kneeFlexion')
      if (kA !== null && kB !== null) knee.push(kB - kA)
      const tA = angleFor(a, frame, 'trunkTorso')
      const tB = angleFor(b, frame, 'trunkTorso')
      if (tA !== null && tB !== null) trunk.push(tB - tA)
      const eA = angleFor(a, frame, 'elbow')
      const eB = angleFor(b, frame, 'elbow')
      if (eA !== null && eB !== null) elbow.push(eB - eA)
    }
  }

  const vsAvailable = frames.some((frame, i) => Boolean(frame.truth && (lite[i] || full[i])))
  const fullAligned = vsAvailable
    ? frames
        .map((frame, i) => (frame.truth && full[i] ? { pred: full[i]!, truth: frame.truth } : null))
        .filter((row): row is { pred: Landmark[]; truth: Landmark[] } => row !== null)
    : []

  const liteAligned = vsAvailable
    ? frames
        .map((frame, i) => (frame.truth && lite[i] ? { pred: lite[i]!, truth: frame.truth } : null))
        .filter((row): row is { pred: Landmark[]; truth: Landmark[] } => row !== null)
    : []

  const liteRmse = liteAligned.length
    ? percentileStats(liteAligned.map((row) => landmarkRmseNorm(row.pred, row.truth).rmseNorm)).mean
    : null
  const fullRmse = fullAligned.length
    ? percentileStats(fullAligned.map((row) => landmarkRmseNorm(row.pred, row.truth).rmseNorm)).mean
    : null

  return {
    landmarkError: {
      liteVsFull: {
        rmseNorm: pairNorm.length ? percentileStats(pairNorm).mean : 0,
        rmsePx: pairNorm.length ? pairPx / pairNorm.length : 0,
        pairedFrames: pairNorm.length,
      },
      vsTruth: {
        available: vsAvailable,
        liteRmseNorm: liteRmse,
        fullRmseNorm: fullRmse,
        pairedFrames: Math.min(liteAligned.length, fullAligned.length),
        joints: vsAvailable
          ? perJointRmse(
              fullAligned.map((row) => row.pred),
              fullAligned.map((row) => row.truth),
            )
          : [],
      },
    },
    angleDeltas: {
      kneeFlexion: angleDeltaStats(knee),
      trunkTorso: angleDeltaStats(trunk),
      elbowFlexion: angleDeltaStats(elbow),
    },
  }
}
