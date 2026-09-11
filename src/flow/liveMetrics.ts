import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import type { PixelPoint } from '../types/calibration.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import { landmarkToPixel } from '../pose/drawIst.ts'
import type { MetricBand, MetricCardModel } from './types.ts'
import { MAX_LIVE_METRIC_CARDS } from './constants.ts'

const DEGENERATE = 1e-9

export function jointInnerDegrees(
  a: PixelPoint | null,
  vertex: PixelPoint | null,
  b: PixelPoint | null,
): number | null {
  if (!a || !vertex || !b) return null
  const ux = a.x - vertex.x
  const uy = a.y - vertex.y
  const vx = b.x - vertex.x
  const vy = b.y - vertex.y
  const uLen = Math.hypot(ux, uy)
  const vLen = Math.hypot(vx, vy)
  if (uLen < DEGENERATE || vLen < DEGENERATE) return null
  const inner = Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy)
  return (inner * 180) / Math.PI
}

function bandFor(value: number | null, lo: number, hi: number, near = 4): MetricBand {
  if (value === null) return 'unknown'
  if (value >= lo && value <= hi) return 'in'
  if (value >= lo - near && value <= hi + near) return 'near'
  return 'out'
}

export type NearJoints = {
  shoulder: PixelPoint | null
  hip: PixelPoint | null
  knee: PixelPoint | null
  ankle: PixelPoint | null
  nearSide: string
}

export function nearJointsPx(frame: PoseFrame | null): NearJoints {
  if (!frame || frame.landmarks.length === 0) {
    return { shoulder: null, hip: null, knee: null, ankle: null, nearSide: '—' }
  }
  const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
  const toPx = (joint: 'SHOULDER' | 'HIP' | 'KNEE' | 'ANKLE') => {
    const lm = visibleJoint(frame.landmarks, near, joint, MIN_LANDMARK_VISIBILITY)
    return lm ? landmarkToPixel(lm, frame.videoWidth, frame.videoHeight) : null
  }
  return {
    shoulder: toPx('SHOULDER'),
    hip: toPx('HIP'),
    knee: toPx('KNEE'),
    ankle: toPx('ANKLE'),
    nearSide: near,
  }
}

export function computeLiveCards(input: {
  frame: PoseFrame | null
  kneeDegrees: number | null
  kneeVisible: boolean
}): MetricCardModel[] {
  const joints = nearJointsPx(input.frame)
  const hipInner = jointInnerDegrees(joints.shoulder, joints.hip, joints.knee)
  const torsoFromVertical = (() => {
    if (!joints.shoulder || !joints.hip) return null
    const dx = joints.shoulder.x - joints.hip.x
    const dy = joints.shoulder.y - joints.hip.y
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    return Number.isFinite(deg) ? Math.abs(deg) : null
  })()

  const cards: MetricCardModel[] = [
    {
      id: 'knee_flexion',
      label: 'Kniebeugung',
      value: input.kneeVisible ? input.kneeDegrees : null,
      unit: '°',
      method: null,
      usableCycles: 0,
      band: bandFor(input.kneeVisible ? input.kneeDegrees : null, 35, 45),
      targetHint: 'Zielband 35–45°',
      detail: 'Kamera-nahe Seite, Flexion',
    },
    {
      id: 'hip_angle',
      label: 'Hüftwinkel',
      value: hipInner,
      unit: '°',
      method: null,
      usableCycles: 0,
      band: bandFor(hipInner, 55, 75),
      targetHint: 'Zielband 55–75°',
      detail: 'Schulter–Hüfte–Knie',
    },
    {
      id: 'torso_lean',
      label: 'Rumpfneigung',
      value: torsoFromVertical,
      unit: '°',
      method: null,
      usableCycles: 0,
      band: bandFor(torsoFromVertical, 30, 50),
      targetHint: 'Zielband 30–50° zur Vertikalen',
      detail: 'Hoods / Oberkörper',
    },
  ]
  return cards.slice(0, MAX_LIVE_METRIC_CARDS)
}
