import { pixelToBike } from '../calibration/transform.ts'
import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import type {
  BikeCalibration,
  PixelPoint,
} from '../types/calibration.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type {
  BodyModel,
  BodySegmentId,
  BodySegmentLength,
  HipOffset,
  SollUiState,
} from '../types/soll.ts'
import { SOLL_SEGMENT_ORDER } from '../types/soll.ts'

const EST = {
  thigh: 0.88,
  shank: 0.86,
  foot: 0.22,
  torso: 0.95,
  upperArm: 0.55,
  forearm: 0.5,
  head: 0.22,
  crank: 0.455,
  hipX: 0.18,
  hipY: -0.14,
  hipTol: 0.08,
} as const

export const DEFAULT_SOLL_UI: SollUiState = {
  mode: 'current_setup',
  showGhost: true,
  showCorridor: true,
  phaseSource: 'pedal',
  syntheticPhase01: 0,
  syntheticPlaying: true,
  limbScale: 1,
}

export function emptyBodyModel(): BodyModel {
  return {
    segments: SOLL_SEGMENT_ORDER.map((id) => ({
      id,
      lengthPx: 0,
      source: 'estimated',
    })),
    hipOffset: { x: 0, y: 0, tolX: 12, tolY: 12, source: 'estimated' },
    crank: { lengthPx: 0, source: 'estimated' },
  }
}

function saddleSpanPx(marks: BikeCalibration['marks']): number | null {
  const { B, S } = marks
  if (!B || !S) return null
  const d = Math.hypot(S.x - B.x, S.y - B.y)
  return d > 8 ? d : null
}

export function estimateBodyModel(calibration: BikeCalibration): BodyModel | null {
  const span = saddleSpanPx(calibration.marks)
  if (span === null) return null
  const segments: BodySegmentLength[] = SOLL_SEGMENT_ORDER.map((id) => ({
    id,
    lengthPx: EST[id] * span,
    source: 'estimated',
  }))
  const hipOffset: HipOffset = {
    x: EST.hipX * span,
    y: EST.hipY * span,
    tolX: EST.hipTol * span,
    tolY: EST.hipTol * span,
    source: 'estimated',
  }
  return {
    segments,
    hipOffset,
    crank: { lengthPx: EST.crank * span, source: 'estimated' },
  }
}

function lmPx(frame: PoseFrame, lm: { x: number; y: number }): PixelPoint {
  return { x: lm.x * frame.videoWidth, y: lm.y * frame.videoHeight }
}

function dist(a: PixelPoint, b: PixelPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Freeze segment lengths and hip offset from the current Ist frame.
 * Does not copy Ist joint positions into the Soll ghost.
 */
export function measureBodyFromIst(
  frame: PoseFrame,
  calibration: BikeCalibration,
): BodyModel | null {
  const transform = calibration.transform
  const saddle = calibration.marks.S
  if (!transform || !saddle || frame.landmarks.length === 0) return null
  const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY)
  if (!near) return null

  const joint = (name: 'SHOULDER' | 'ELBOW' | 'WRIST' | 'HIP' | 'KNEE' | 'ANKLE' | 'HEEL' | 'FOOT_INDEX') => {
    const lm = visibleJoint(frame.landmarks, near, name, MIN_LANDMARK_VISIBILITY)
    return lm ? lmPx(frame, lm) : null
  }

  const hip = joint('HIP')
  const knee = joint('KNEE')
  const ankle = joint('ANKLE')
  const heel = joint('HEEL')
  const foot = joint('FOOT_INDEX')
  const shoulder = joint('SHOULDER')
  const elbow = joint('ELBOW')
  const wrist = joint('WRIST')

  const fallback = estimateBodyModel(calibration)
  if (!fallback) return null

  const take = (id: BodySegmentId, px: number | null): BodySegmentLength => {
    const est = fallback.segments.find((s) => s.id === id) ?? {
      id,
      lengthPx: 0,
      source: 'estimated' as const,
    }
    if (px !== null && px > 4) return { id, lengthPx: px, source: 'measured' }
    return est
  }

  const nose = frame.landmarks[0]
  const headPx =
    shoulder && nose && (nose.visibility ?? 0) >= MIN_LANDMARK_VISIBILITY
      ? dist(shoulder, lmPx(frame, nose))
      : null

  const segments: BodySegmentLength[] = [
    take('thigh', hip && knee ? dist(hip, knee) : null),
    take('shank', knee && ankle ? dist(knee, ankle) : null),
    take('foot', heel && foot ? dist(heel, foot) : ankle && foot ? dist(ankle, foot) : null),
    take('torso', hip && shoulder ? dist(hip, shoulder) : null),
    take('upperArm', shoulder && elbow ? dist(shoulder, elbow) : null),
    take('forearm', elbow && wrist ? dist(elbow, wrist) : null),
    take('head', headPx),
  ]

  let hipOffset = fallback.hipOffset
  if (hip) {
    const hipBike = pixelToBike(hip, transform)
    const saddleBike = pixelToBike(saddle, transform)
    hipOffset = {
      x: hipBike.x - saddleBike.x,
      y: hipBike.y - saddleBike.y,
      tolX: fallback.hipOffset.tolX,
      tolY: fallback.hipOffset.tolY,
      source: 'measured',
    }
  }

  return { segments, hipOffset, crank: fallback.crank }
}

export function scaledBodyModel(model: BodyModel, limbScale: number): BodyModel {
  const s = Number.isFinite(limbScale) && limbScale > 0 ? limbScale : 1
  if (s === 1) return model
  return {
    ...model,
    segments: model.segments.map((seg) => ({ ...seg, lengthPx: seg.lengthPx * s })),
  }
}

export function segmentMap(model: BodyModel): Record<BodySegmentId, BodySegmentLength> {
  const out = {} as Record<BodySegmentId, BodySegmentLength>
  for (const seg of model.segments) out[seg.id] = seg
  return out
}
