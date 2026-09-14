import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import { kneeFlexionDeg } from '../metrics/angles.ts'
import type { CameraNearSide, PoseFrame } from '../types/landmarks.ts'
import type { MarkerlessReason } from '../types/analysis.ts'
import type { MarkerlessOptions } from './constants.ts'

export type NormPoint = { x: number; y: number }

export type MarkerlessSample = {
  index: number
  mediaTimeMs: number
  pose: PoseFrame
  side: CameraNearSide | null
  accepted: boolean
  hip: NormPoint | null
  knee: NormPoint | null
  ankle: NormPoint | null
  flexionDeg: number | null
  hipAnkleAngleDeg: number | null
  hipAnkleRadius: number | null
  reasons: MarkerlessReason[]
}

function landmarkNorm(
  pose: PoseFrame,
  side: CameraNearSide,
  joint: 'HIP' | 'KNEE' | 'ANKLE',
  minVisibility: number,
): NormPoint | null {
  const lm = visibleJoint(pose.landmarks, side, joint, minVisibility)
  if (!lm) return null
  if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return null
  if (lm.x < 0 || lm.x > 1 || lm.y < 0 || lm.y > 1) return null
  return { x: lm.x, y: lm.y }
}

function hipAnklePolar(hip: NormPoint, ankle: NormPoint): { angleDeg: number; radius: number } {
  const dx = ankle.x - hip.x
  const dy = -(ankle.y - hip.y)
  const radius = Math.hypot(dx, dy)
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  if (angleDeg < 0) angleDeg += 360
  return { angleDeg, radius }
}

function flexionOf(hip: NormPoint, knee: NormPoint, ankle: NormPoint, pose: PoseFrame): number | null {
  const toBike = (p: NormPoint) => ({ x: p.x * pose.videoWidth, y: -p.y * pose.videoHeight })
  return kneeFlexionDeg(toBike(hip), toBike(knee), toBike(ankle))
}

export function sampleFromPose(
  pose: PoseFrame,
  index: number,
  options: Pick<MarkerlessOptions, 'minVisibility'>,
  lockedSide: CameraNearSide | null,
  accepted: boolean,
): MarkerlessSample {
  const reasons: MarkerlessReason[] = []
  const instant = pose.nearSide ?? inferNearSide(pose.landmarks, options.minVisibility) ?? null
  const side = lockedSide ?? instant
  if (!accepted || !side) {
    if (!side) reasons.push('missing_knee')
    return {
      index,
      mediaTimeMs: pose.timestampMs,
      pose,
      side,
      accepted: false,
      hip: null,
      knee: null,
      ankle: null,
      flexionDeg: null,
      hipAnkleAngleDeg: null,
      hipAnkleRadius: null,
      reasons,
    }
  }

  const hip = landmarkNorm(pose, side, 'HIP', options.minVisibility)
  const knee = landmarkNorm(pose, side, 'KNEE', options.minVisibility)
  const ankle = landmarkNorm(pose, side, 'ANKLE', options.minVisibility)
  if (!hip || !ankle) reasons.push('visibility')
  if (!knee) reasons.push('missing_knee')

  const polar = hip && ankle ? hipAnklePolar(hip, ankle) : null
  const flexion = hip && knee && ankle ? flexionOf(hip, knee, ankle, pose) : null
  if (hip && knee && ankle && (flexion === null || !Number.isFinite(flexion))) {
    reasons.push('visibility')
  }

  return {
    index,
    mediaTimeMs: pose.timestampMs,
    pose,
    side,
    accepted: true,
    hip,
    knee,
    ankle,
    flexionDeg: flexion != null && Number.isFinite(flexion) ? flexion : null,
    hipAnkleAngleDeg: polar?.angleDeg ?? null,
    hipAnkleRadius: polar?.radius ?? null,
    reasons,
  }
}
