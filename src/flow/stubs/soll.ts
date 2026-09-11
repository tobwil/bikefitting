import { IST_CHAIN } from '../../types/landmarks.ts'
import type { PixelPoint } from '../../types/calibration.ts'
import { inferNearSide, visibleJoint, type ChainJoint } from '../../pose/nearSide.ts'
import { landmarkToPixel } from '../../pose/drawIst.ts'
import { MIN_LANDMARK_VISIBILITY } from '../../config/defaults.ts'
import type { SollApi } from '../contracts.ts'
import type { OverlayGhost } from '../../shell/drawGhost.ts'

/**
 * STUB Soll: Ist chain, slightly more extended at the knee.
 * Not an IK solver. Never used to invent missing Ist points.
 */
export const stubSoll: SollApi = {
  source: 'stub',
  ghost({ pose, videoSize }) {
    if (!pose || pose.landmarks.length === 0) return null
    const near = pose.nearSide ?? inferNearSide(pose.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
    const w = videoSize.width || pose.videoWidth
    const h = videoSize.height || pose.videoHeight
    const px = (joint: ChainJoint): PixelPoint | null => {
      const lm = visibleJoint(pose.landmarks, near, joint, MIN_LANDMARK_VISIBILITY)
      return lm ? landmarkToPixel(lm, w, h) : null
    }

    const hip = px('HIP')
    const knee = px('KNEE')
    const ankle = px('ANKLE')
    const shiftedKnee =
      hip && knee && ankle
        ? {
            x: knee.x + (ankle.x - hip.x) * 0.04,
            y: knee.y + (ankle.y - hip.y) * 0.04,
          }
        : knee

    const pointOf = (joint: ChainJoint): PixelPoint | null => {
      if (joint === 'KNEE') return shiftedKnee
      return px(joint)
    }

    const segments: OverlayGhost['segments'] = []
    const points: PixelPoint[] = []
    for (const chain of [IST_CHAIN.arm, IST_CHAIN.leg]) {
      const pts = chain.map(pointOf)
      for (const p of pts) if (p) points.push(p)
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i]
        const b = pts[i + 1]
        if (a && b) segments.push([a, b])
      }
    }
    if (segments.length === 0) return null
    return {
      kind: 'soll',
      segments,
      points,
      label: 'Soll',
      stub: true,
    }
  },
}
