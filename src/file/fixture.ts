import type { SourceTransform } from '../types/file.ts'
import { IDENTITY_SOURCE_TRANSFORM } from './frameTransform.ts'
import type { MetricsFrame } from '../types/metrics.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { SYNTHETIC_MARKS, syntheticCrankAngleDeg, syntheticPedalPixel } from '../camera/synthetic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'

/**
 * Deterministic local "clip" used as a regression fixture.
 * Generated in-process — not a rider recording. See fixtures/file-replay/RIGHTS.md.
 */
export const FILE_FIXTURE_ID = 'bikefit.file-replay.synthetic-crank.v1'

export const FILE_FIXTURE_FPS = 30
export const FILE_FIXTURE_RPM = 80
export const FILE_FIXTURE_WIDTH = 1280
export const FILE_FIXTURE_HEIGHT = 720
export const FILE_FIXTURE_REVS = 8

const MS_PER_REV = (60 / FILE_FIXTURE_RPM) * 1000
const DT_MS = 1000 / FILE_FIXTURE_FPS

export const FILE_FIXTURE_TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

if (!FILE_FIXTURE_TRANSFORM) {
  throw new Error('File replay fixture requires a valid synthetic B/S/G transform.')
}

export const FILE_FIXTURE_SOURCE_TRANSFORM: SourceTransform = IDENTITY_SOURCE_TRANSFORM

export type FileFixtureFrame = MetricsFrame & { mediaTimeMs: number }

function lockedPedal(timestampMs: number): PedalSample {
  const angle = syntheticCrankAngleDeg(timestampMs)
  return {
    timestampMs,
    pixel: syntheticPedalPixel(timestampMs),
    crankAngleDeg: angle,
    phase01: angle / 360,
    revolutions: Math.floor(timestampMs / MS_PER_REV),
    status: 'locked',
    lostFrames: 0,
  }
}

export function fileFixturePose(mediaTimeMs: number): PoseFrame {
  const pose = syntheticPoseFrame(mediaTimeMs)
  return {
    ...pose,
    timestampMs: mediaTimeMs,
    videoWidth: FILE_FIXTURE_WIDTH,
    videoHeight: FILE_FIXTURE_HEIGHT,
    engine: 'synthetic',
  }
}

export function fileFixtureFrame(mediaTimeMs: number): FileFixtureFrame {
  return {
    timestampMs: mediaTimeMs,
    mediaTimeMs,
    pose: fileFixturePose(mediaTimeMs),
    pedal: lockedPedal(mediaTimeMs),
    transform: FILE_FIXTURE_TRANSFORM,
  }
}

export function fileFixtureClip(revolutions = FILE_FIXTURE_REVS): FileFixtureFrame[] {
  const durationMs = revolutions * MS_PER_REV
  const frames: FileFixtureFrame[] = []
  for (let t = 0; t < durationMs; t += DT_MS) {
    frames.push(fileFixtureFrame(t))
  }
  return frames
}

export function fileFixtureDurationMs(revolutions = FILE_FIXTURE_REVS): number {
  return revolutions * MS_PER_REV
}
