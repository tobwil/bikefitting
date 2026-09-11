import {
  IST_CHAIN,
  POSE_LANDMARK,
  type CameraNearSide,
  type Landmark,
  type LandmarkName,
} from '../types/landmarks.ts'

const NEAR_SIDE_JOINTS = [
  'SHOULDER', 'ELBOW', 'WRIST', 'HIP', 'KNEE', 'ANKLE',
] as const

export type ChainJoint = (typeof IST_CHAIN.arm)[number] | (typeof IST_CHAIN.leg)[number]

export function isLandmarkVisible(
  landmark: Landmark | undefined,
  minVisibility: number,
): landmark is Landmark {
  if (!landmark) return false
  return (landmark.visibility ?? 0) >= minVisibility
}

export function landmarkForJoint(nearSide: CameraNearSide, joint: ChainJoint): number {
  const name = `${nearSide === 'left' ? 'LEFT' : 'RIGHT'}_${joint}` as LandmarkName
  return POSE_LANDMARK[name]
}

function sideMetrics(landmarks: Landmark[], side: CameraNearSide) {
  let visSum = 0
  let zSum = 0
  let n = 0
  for (const joint of NEAR_SIDE_JOINTS) {
    const lm = landmarks[landmarkForJoint(side, joint)]
    if (!lm) continue
    visSum += lm.visibility ?? 0
    zSum += lm.z
    n += 1
  }
  if (n === 0) return null
  return { vis: visSum / n, z: zSum / n }
}

export function inferNearSide(
  landmarks: Landmark[],
  minVisibility: number,
): CameraNearSide | undefined {
  if (landmarks.length === 0) return undefined
  const left = sideMetrics(landmarks, 'left')
  const right = sideMetrics(landmarks, 'right')
  const leftOk = !!left && left.vis >= minVisibility
  const rightOk = !!right && right.vis >= minVisibility
  if (leftOk && rightOk && left && right) {
    const delta = left.vis - right.vis
    if (Math.abs(delta) >= 0.05) return delta > 0 ? 'left' : 'right'
    if (left.z !== right.z) return left.z < right.z ? 'left' : 'right'
    return left.vis >= right.vis ? 'left' : 'right'
  }
  if (leftOk) return 'left'
  if (rightOk) return 'right'
  if (left && right) return left.vis >= right.vis ? 'left' : 'right'
  if (left) return 'left'
  if (right) return 'right'
  return undefined
}

export function visibleJoint(
  landmarks: Landmark[],
  nearSide: CameraNearSide,
  joint: ChainJoint,
  minVisibility: number,
): Landmark | null {
  const lm = landmarks[landmarkForJoint(nearSide, joint)]
  return isLandmarkVisible(lm, minVisibility) ? lm : null
}

export function visibleChainSegments(
  landmarks: Landmark[],
  nearSide: CameraNearSide,
  joints: readonly ChainJoint[],
  minVisibility: number,
): Array<[Landmark, Landmark]> {
  const points = joints.map((joint) => visibleJoint(landmarks, nearSide, joint, minVisibility))
  const segments: Array<[Landmark, Landmark]> = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (a && b) segments.push([a, b])
  }
  return segments
}

export function visibleChainPoints(
  landmarks: Landmark[],
  nearSide: CameraNearSide,
  joints: readonly ChainJoint[],
  minVisibility: number,
): Landmark[] {
  const out: Landmark[] = []
  for (const joint of joints) {
    const lm = visibleJoint(landmarks, nearSide, joint, minVisibility)
    if (lm) out.push(lm)
  }
  return out
}
