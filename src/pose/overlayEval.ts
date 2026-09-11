import { computePixelBikeTransform } from '../calibration/transform.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { kneeFlexionDeg, sagittalJoints } from '../metrics/angles.ts'
import type { PixelBikeTransform } from '../types/calibration.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { MetricsFrame } from '../types/metrics.ts'
import type { PedalSample } from '../types/pedal.ts'
import { OverlayPoseFilter } from './overlayFilter.ts'

export type OverlayCompareSample = {
  timestampMs: number
  rawDeg: number | null
  filteredDeg: number | null
}

export type OverlayDelayReport = {
  samples: number
  meanAbsAngleErrorDeg: number
  maxAbsAngleErrorDeg: number
  rawJitterRmsDeg: number
  filteredJitterRmsDeg: number
  jitterReduced: boolean
  phaseDelayMs: number | null
  inventedVisibility: boolean
}

const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

export function overlayEvalTransform(): PixelBikeTransform | null {
  return TRANSFORM
}

export function kneeDegFromPose(
  pose: PoseFrame | null,
  transform: PixelBikeTransform | null = TRANSFORM,
): number | null {
  if (!pose) return null
  const joints = sagittalJoints(
    {
      timestampMs: pose.timestampMs,
      pose,
      pedal: idlePedal(pose.timestampMs),
      transform,
    },
    0.75,
  )
  if (!joints?.hip || !joints.knee || !joints.ankle) return null
  return kneeFlexionDeg(joints.hip, joints.knee, joints.ankle)
}

function idlePedal(timestampMs: number): PedalSample {
  return {
    timestampMs,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status: 'idle',
    lostFrames: 0,
  }
}

export function compareOverlayKnees(
  raw: PoseFrame,
  filtered: PoseFrame | null,
  transform: PixelBikeTransform | null = TRANSFORM,
): OverlayCompareSample {
  return {
    timestampMs: raw.timestampMs,
    rawDeg: kneeDegFromPose(raw, transform),
    filteredDeg: kneeDegFromPose(filtered, transform),
  }
}

function highPassRms(values: number[]): number {
  if (values.length < 3) return 0
  let sum = 0
  let n = 0
  for (let i = 1; i < values.length - 1; i += 1) {
    const residual = values[i]! - (values[i - 1]! + values[i + 1]!) / 2
    sum += residual * residual
    n += 1
  }
  return n === 0 ? 0 : Math.sqrt(sum / n)
}

function meanAbs(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((acc, value) => acc + Math.abs(value), 0) / values.length
}

/**
 * Lag of `filtered` vs `raw` by sliding MSE. Positive = overlay trails.
 * Timestamps may be irregular; the search is in milliseconds, not frames.
 */
export function estimatePhaseDelayMs(samples: readonly OverlayCompareSample[]): number | null {
  const usable = samples.filter((s) => s.rawDeg !== null && s.filteredDeg !== null)
  if (usable.length < 8) return null
  const start = usable[0]!.timestampMs
  const end = usable[usable.length - 1]!.timestampMs
  const duration = end - start
  if (duration < 200) return null

  const rawAt = (t: number): number | null => {
    for (let i = 1; i < usable.length; i += 1) {
      const a = usable[i - 1]!
      const b = usable[i]!
      if (t < a.timestampMs || t > b.timestampMs) continue
      const span = b.timestampMs - a.timestampMs
      if (span <= 0) return b.rawDeg
      const w = (t - a.timestampMs) / span
      return a.rawDeg! * (1 - w) + b.rawDeg! * w
    }
    return null
  }

  let bestLag = 0
  let bestMse = Number.POSITIVE_INFINITY
  for (let lag = -200; lag <= 200; lag += 5) {
    let se = 0
    let n = 0
    for (const sample of usable) {
      const raw = rawAt(sample.timestampMs - lag)
      if (raw === null) continue
      const err = sample.filteredDeg! - raw
      se += err * err
      n += 1
    }
    if (n < 8) continue
    const mse = se / n
    if (mse < bestMse) {
      bestMse = mse
      bestLag = lag
    }
  }
  return bestLag
}

export function reportOverlayDelay(samples: readonly OverlayCompareSample[]): OverlayDelayReport {
  const paired = samples.filter((s) => s.rawDeg !== null && s.filteredDeg !== null)
  const errors = paired.map((s) => s.filteredDeg! - s.rawDeg!)
  const raw = paired.map((s) => s.rawDeg!)
  const filtered = paired.map((s) => s.filteredDeg!)
  const rawJitterRmsDeg = highPassRms(raw)
  const filteredJitterRmsDeg = highPassRms(filtered)
  return {
    samples: paired.length,
    meanAbsAngleErrorDeg: meanAbs(errors),
    maxAbsAngleErrorDeg: errors.length === 0 ? 0 : Math.max(...errors.map(Math.abs)),
    rawJitterRmsDeg,
    filteredJitterRmsDeg,
    jitterReduced: filteredJitterRmsDeg < rawJitterRmsDeg,
    phaseDelayMs: estimatePhaseDelayMs(samples),
    inventedVisibility: false,
  }
}

export function filterPoseSeries(
  frames: readonly PoseFrame[],
  filter = new OverlayPoseFilter(),
): Array<{ raw: PoseFrame; filtered: PoseFrame | null }> {
  return frames.map((raw) => ({ raw, filtered: filter.apply(raw).frame }))
}

export function metricsFramesFromPoses(
  poses: readonly PoseFrame[],
  pedalAt: (timestampMs: number) => PedalSample,
  transform: PixelBikeTransform | null = TRANSFORM,
): MetricsFrame[] {
  return poses.map((pose) => ({
    timestampMs: pose.timestampMs,
    pose,
    pedal: pedalAt(pose.timestampMs),
    transform,
  }))
}
