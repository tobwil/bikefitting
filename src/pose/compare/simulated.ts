import { POSE_LANDMARK, type Landmark } from '../../types/landmarks.ts'
import type { PoseDetectResult, PoseModelVariant } from '../../types/pose-engine.ts'
import type { PoseCompareFrame } from '../../types/pose-compare.ts'

const DISTAL = new Set<number>([
  POSE_LANDMARK.LEFT_ELBOW,
  POSE_LANDMARK.RIGHT_ELBOW,
  POSE_LANDMARK.LEFT_WRIST,
  POSE_LANDMARK.RIGHT_WRIST,
  POSE_LANDMARK.LEFT_ANKLE,
  POSE_LANDMARK.RIGHT_ANKLE,
  POSE_LANDMARK.LEFT_HEEL,
  POSE_LANDMARK.RIGHT_HEEL,
  POSE_LANDMARK.LEFT_FOOT_INDEX,
  POSE_LANDMARK.RIGHT_FOOT_INDEX,
])

/** Deterministic jitter so Lite looks worse on distal joints than Full. Not MediaPipe. */
export function jitterLandmarks(
  truth: Landmark[],
  model: PoseModelVariant,
  timestampMs: number,
): Landmark[] {
  const distal = model === 'lite' ? 0.018 : 0.004
  const proximal = model === 'lite' ? 0.006 : 0.002
  return truth.map((lm, index) => {
    const amp = DISTAL.has(index) ? distal : proximal
    const phase = timestampMs * 0.01 + index
    return {
      ...lm,
      x: lm.x + Math.sin(phase) * amp,
      y: lm.y + Math.cos(phase * 1.3) * amp,
    }
  })
}

export async function simulatedDetect(model: PoseModelVariant, frame: PoseCompareFrame): Promise<PoseDetectResult> {
  if (!frame.truth || frame.truth.length === 0) return { status: 'miss' }
  const landmarks = jitterLandmarks(frame.truth, model, frame.timestampMs)
  return {
    status: 'frame',
    frame: {
      timestampMs: frame.timestampMs,
      videoWidth: frame.width,
      videoHeight: frame.height,
      landmarks,
      inferenceMs: model === 'lite' ? 8.2 : 17.6,
      engine: 'mediapipe',
      model,
    },
  }
}

export function simulatedLoad(model: PoseModelVariant): Promise<{ initMs: number }> {
  return Promise.resolve({ initMs: model === 'lite' ? 42 : 118 })
}
