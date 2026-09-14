import { POSE_LANDMARK, type PoseFrame } from '../types/landmarks.ts'
import { SYNTHETIC_MARKS, syntheticPedalPixel } from '../camera/synthetic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { encodePoseReplayClip } from './fromClip.ts'

export const MARKERLESS_FIXTURE_CLIP_ID = 'bikefit.markerless.synthetic-crank.v1'
export const MARKERLESS_FIXTURE_CAPTURE_ID = 'cap-markerless-fixture'
export const MARKERLESS_FIXTURE_FPS = 30
export const MARKERLESS_FIXTURE_RPM = 80
export const MARKERLESS_FIXTURE_WIDTH = 1280
export const MARKERLESS_FIXTURE_HEIGHT = 720

const DT_MS = 1000 / MARKERLESS_FIXTURE_FPS
const MS_PER_REV = (60 / MARKERLESS_FIXTURE_RPM) * 1000
const W = MARKERLESS_FIXTURE_WIDTH
const H = MARKERLESS_FIXTURE_HEIGHT

export type FixtureKneeMode = 'natural' | 'extended_at_tdc'

export type FixtureClipSpec = {
  revs?: number
  prefixStillMs?: number
  suffixStillMs?: number
  prefixMountMs?: number
  suffixDismountMs?: number
  hideKnee?: boolean
  freezePedal?: boolean
  kneeMode?: FixtureKneeMode
  startMs?: number
}

function withKneeMode(pose: PoseFrame, timestampMs: number, mode: FixtureKneeMode): PoseFrame {
  if (mode === 'natural') return pose
  const pedal = syntheticPedalPixel(timestampMs)
  const hipPx = { x: SYNTHETIC_MARKS.S.x + 36, y: SYNTHETIC_MARKS.S.y + 28 }
  const angle = ((timestampMs * (MARKERLESS_FIXTURE_RPM / 60) * 360) / 1000) % 360
  const rad = (angle * Math.PI) / 180
  // Flexed at BDC (crank 180°), extended at TDC — disagrees with a BDC reading.
  const flex = 0.5 * (1 - Math.cos(rad))
  const midX = (hipPx.x + pedal.x) / 2
  const midY = (hipPx.y + pedal.y) / 2
  const dx = pedal.x - hipPx.x
  const dy = pedal.y - hipPx.y
  const plen = Math.hypot(-dy, dx) || 1
  const offset = 18 + 55 * flex
  const knee = { x: midX + (-dy / plen) * offset, y: midY + (dx / plen) * offset }
  const landmarks = pose.landmarks.map((item, i) => {
    if (i !== POSE_LANDMARK.RIGHT_KNEE) return item
    return { ...item, x: knee.x / W, y: knee.y / H, visibility: 0.96 }
  })
  return { ...pose, landmarks }
}

function hideKnees(pose: PoseFrame): PoseFrame {
  const hide = new Set<number>([POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.RIGHT_KNEE])
  return {
    ...pose,
    landmarks: pose.landmarks.map((item, i) => (hide.has(i) ? { ...item, visibility: 0.05 } : item)),
  }
}

function shiftHip(pose: PoseFrame, dxNorm: number): PoseFrame {
  const idx = new Set<number>([
    POSE_LANDMARK.RIGHT_HIP,
    POSE_LANDMARK.LEFT_HIP,
    POSE_LANDMARK.RIGHT_SHOULDER,
    POSE_LANDMARK.LEFT_SHOULDER,
  ])
  return {
    ...pose,
    landmarks: pose.landmarks.map((item, i) =>
      idx.has(i) ? { ...item, x: item.x + dxNorm } : item,
    ),
  }
}

function freezeAt(timestampMs: number, freezeMs: number): PoseFrame {
  return { ...syntheticPoseFrame(freezeMs), timestampMs }
}

export function buildMarkerlessPoseFrames(spec: FixtureClipSpec = {}): PoseFrame[] {
  const revs = spec.revs ?? 13
  const prefixStillMs = spec.prefixStillMs ?? 0
  const suffixStillMs = spec.suffixStillMs ?? 0
  const prefixMountMs = spec.prefixMountMs ?? 0
  const suffixDismountMs = spec.suffixDismountMs ?? 0
  const startMs = spec.startMs ?? 0
  const frames: PoseFrame[] = []
  let t = startMs

  const push = (pose: PoseFrame) => {
    let next: PoseFrame = {
      ...pose,
      timestampMs: t,
      videoWidth: W,
      videoHeight: H,
      engine: 'synthetic',
    }
    next = withKneeMode(next, spec.freezePedal ? 0 : t - startMs - prefixStillMs - prefixMountMs, spec.kneeMode ?? 'natural')
    if (spec.hideKnee) next = hideKnees(next)
    frames.push(next)
    t += DT_MS
  }

  for (let ms = 0; ms < prefixMountMs; ms += DT_MS) {
    const u = prefixMountMs <= 0 ? 0 : ms / prefixMountMs
    const pose = syntheticPoseFrame(0)
    push(shiftHip(pose, 0.25 * (1 - u)))
  }
  for (let ms = 0; ms < prefixStillMs; ms += DT_MS) {
    push(freezeAt(t, 0))
  }
  const rideMs = revs * MS_PER_REV
  for (let ms = 0; ms < rideMs; ms += DT_MS) {
    if (spec.freezePedal) push(freezeAt(t, 0))
    else push(syntheticPoseFrame(ms))
  }
  for (let ms = 0; ms < suffixStillMs; ms += DT_MS) {
    push(freezeAt(t, rideMs))
  }
  for (let ms = 0; ms < suffixDismountMs; ms += DT_MS) {
    const u = suffixDismountMs <= 0 ? 1 : ms / suffixDismountMs
    const pose = syntheticPoseFrame(rideMs)
    push(shiftHip(pose, 0.25 * u))
  }
  return frames
}

export function buildMarkerlessFixtureClip(spec: FixtureClipSpec = {}): {
  clipId: string
  captureId: string
  frames: PoseFrame[]
  bytes: Uint8Array
} {
  const frames = buildMarkerlessPoseFrames(spec)
  const clipId = spec.hideKnee
    ? `${MARKERLESS_FIXTURE_CLIP_ID}.hidden-knee`
    : spec.freezePedal
      ? `${MARKERLESS_FIXTURE_CLIP_ID}.still`
      : MARKERLESS_FIXTURE_CLIP_ID
  const bytes = encodePoseReplayClip({
    clipId,
    captureId: MARKERLESS_FIXTURE_CAPTURE_ID,
    fps: MARKERLESS_FIXTURE_FPS,
    width: W,
    height: H,
    frames,
  })
  return { clipId, captureId: MARKERLESS_FIXTURE_CAPTURE_ID, frames, bytes }
}

export { DT_MS as MARKERLESS_FIXTURE_DT_MS, MS_PER_REV as MARKERLESS_FIXTURE_MS_PER_REV }
