import {
  SYNTHETIC_MARKS,
  syntheticPedalPixel,
} from '../camera/synthetic.ts'
import type { Landmark, PoseFrame } from '../types/landmarks.ts'

const W = 1280
const H = 720

function lm(x: number, y: number, visibility: number, z = 0): Landmark {
  return { x: x / W, y: y / H, z, visibility }
}

const HIDDEN: Landmark = { x: 0, y: 0, z: 0.4, visibility: 0.05 }

/**
 * Landmarks that match the canvas fixture in `camera/synthetic.ts`.
 * Camera-near side is the rider's right (bike faces +X).
 */
export function syntheticPoseFrame(timestampMs: number): PoseFrame {
  const { B, S, G } = SYNTHETIC_MARKS
  const pedal = syntheticPedalPixel(timestampMs)
  const hip = { x: S.x + 36, y: S.y + 28 }
  const shoulder = { x: G.x - 150, y: G.y - 70 }
  const elbow = { x: G.x - 70, y: G.y - 10 }
  const knee = {
    x: (hip.x + pedal.x) / 2 + 18,
    y: (hip.y + pedal.y) / 2 + 8,
  }
  const heel = { x: pedal.x - 10, y: pedal.y + 8 }
  const foot = { x: pedal.x + 16, y: pedal.y + 4 }
  const head = { x: shoulder.x + 8, y: shoulder.y - 28 }

  const far = (p: { x: number; y: number }, z = 0.25): Landmark =>
    lm(p.x - 22, p.y + 4, 0.2, z)

  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ ...HIDDEN }))
  const vis = 0.96
  landmarks[0] = lm(head.x, head.y, vis, -0.02)
  landmarks[12] = lm(shoulder.x, shoulder.y, vis, -0.04)
  landmarks[14] = lm(elbow.x, elbow.y, vis, -0.03)
  landmarks[16] = lm(G.x, G.y, vis, -0.02)
  landmarks[24] = lm(hip.x, hip.y, vis, -0.03)
  landmarks[26] = lm(knee.x, knee.y, vis, -0.02)
  landmarks[28] = lm(pedal.x, pedal.y, vis, -0.01)
  landmarks[30] = lm(heel.x, heel.y, vis, -0.01)
  landmarks[32] = lm(foot.x, foot.y, vis, 0)
  landmarks[11] = far(shoulder)
  landmarks[13] = far(elbow)
  landmarks[15] = far(G)
  landmarks[23] = far(hip)
  landmarks[25] = far(knee)
  landmarks[27] = far(pedal)
  landmarks[29] = far(heel)
  landmarks[31] = far(foot)
  void B

  return {
    timestampMs,
    videoWidth: W,
    videoHeight: H,
    landmarks,
    inferenceMs: 0,
    engine: 'synthetic',
    nearSide: 'right',
  }
}
