import { measureKneeAngle } from '../calibration/kneeAngle.ts'
import { pixelToBike } from '../calibration/transform.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import type { BikePoint, PixelBikeTransform } from '../types/calibration.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { MetricsFrame } from '../types/metrics.ts'

const DEGENERATE_LEN = 1e-9

export type SagittalJoints = {
  hip: BikePoint | null
  knee: BikePoint | null
  ankle: BikePoint | null
  shoulder: BikePoint | null
  elbow: BikePoint | null
  wrist: BikePoint | null
}

function landmarkToBike(
  lm: { x: number; y: number } | null,
  pose: PoseFrame,
  transform: PixelBikeTransform | null,
): BikePoint | null {
  if (!lm) return null
  const pixel = { x: lm.x * pose.videoWidth, y: lm.y * pose.videoHeight }
  if (transform) return pixelToBike(pixel, transform)
  // Uncalibrated fallback: camera x, y up. Not a claim of millimetre accuracy.
  return { x: pixel.x, y: -pixel.y }
}

export function sagittalJoints(frame: MetricsFrame, minVisibility: number): SagittalJoints | null {
  const pose = frame.pose
  if (!pose || pose.landmarks.length === 0) return null
  const near = pose.nearSide ?? inferNearSide(pose.landmarks, minVisibility)
  if (!near) return null
  const t = frame.transform
  const joint = (name: 'HIP' | 'KNEE' | 'ANKLE' | 'SHOULDER' | 'ELBOW' | 'WRIST') =>
    landmarkToBike(visibleJoint(pose.landmarks, near, name, minVisibility), pose, t)
  return {
    hip: joint('HIP'),
    knee: joint('KNEE'),
    ankle: joint('ANKLE'),
    shoulder: joint('SHOULDER'),
    elbow: joint('ELBOW'),
    wrist: joint('WRIST'),
  }
}

/**
 * Knee flexion φ (sagittal 2D, camera-near side).
 *
 * Joints: hip – knee – ankle, projected into the bike plane (x forward, y up)
 * when a calibration transform is present; otherwise pixel x with y inverted.
 *
 * Inner θ = atan2(|u × v|, u · v) at the knee, u = hip−knee, v = ankle−knee.
 * Flexion φ = 180° − θ.
 *   0° = straight leg (hip, knee, ankle colinear, opening 180°).
 *  90° = right angle at the knee.
 *
 * Same definition as `measureKneeAngle(..., 'flexion')` in calibration.
 * Numeric only — no Ampel.
 */
export function kneeFlexionDeg(hip: BikePoint, knee: BikePoint, ankle: BikePoint): number | null {
  const reading = measureKneeAngle(hip, knee, ankle, 'flexion')
  return reading.visible ? reading.degrees : null
}

/**
 * Trunk / torso inclination α (sagittal 2D, camera-near side).
 *
 * Vector: hip → shoulder in the bike plane (x forward, y up).
 * α = atan2(shoulder.y − hip.y, shoulder.x − hip.x), folded into [0, 180).
 *   0° = torso along +x (horizontal, fully tucked).
 *  90° = torso along +y (upright).
 *
 * This is torso inclination from the bike horizontal, not a hip-joint angle
 * and not a spine-vs-vertical clinical measure.
 * Numeric only — no Ampel.
 */
export function trunkTorsoDeg(hip: BikePoint, shoulder: BikePoint): number | null {
  const dx = shoulder.x - hip.x
  const dy = shoulder.y - hip.y
  if (Math.hypot(dx, dy) < DEGENERATE_LEN) return null
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (deg < 0) deg += 360
  if (deg >= 180) deg = 360 - deg
  return deg
}

/**
 * Elbow flexion φ (sagittal 2D, camera-near side).
 *
 * Joints: shoulder – elbow – wrist in the same plane as the knee metric.
 *
 * Inner θ = atan2(|u × v|, u · v) at the elbow,
 *   u = shoulder−elbow, v = wrist−elbow.
 * Flexion φ = 180° − θ.
 *   0° = straight arm.
 *  90° = right angle at the elbow.
 *
 * Numeric only — no Ampel.
 */
export function elbowFlexionDeg(
  shoulder: BikePoint,
  elbow: BikePoint,
  wrist: BikePoint,
): number | null {
  const ux = shoulder.x - elbow.x
  const uy = shoulder.y - elbow.y
  const vx = wrist.x - elbow.x
  const vy = wrist.y - elbow.y
  const uLen = Math.hypot(ux, uy)
  const vLen = Math.hypot(vx, vy)
  if (uLen < DEGENERATE_LEN || vLen < DEGENERATE_LEN) return null
  const dot = ux * vx + uy * vy
  const cross = ux * vy - uy * vx
  const innerDeg = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI
  return 180 - innerDeg
}

export function sampleMetricDegrees(
  joints: SagittalJoints,
  id: 'kneeFlexion' | 'trunkTorso' | 'elbow',
): number | null {
  if (id === 'kneeFlexion') {
    if (!joints.hip || !joints.knee || !joints.ankle) return null
    return kneeFlexionDeg(joints.hip, joints.knee, joints.ankle)
  }
  if (id === 'trunkTorso') {
    if (!joints.hip || !joints.shoulder) return null
    return trunkTorsoDeg(joints.hip, joints.shoulder)
  }
  if (!joints.shoulder || !joints.elbow || !joints.wrist) return null
  return elbowFlexionDeg(joints.shoulder, joints.elbow, joints.wrist)
}
