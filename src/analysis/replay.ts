import { MeasureSideLock } from '../pose/measureSideLock.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { MarkerlessOptions } from './constants.ts'
import { sampleFromPose, type MarkerlessSample } from './samples.ts'

export type PoseReplayResult = {
  samples: MarkerlessSample[]
  lockedSide: MarkerlessSample['side']
  sideSwitch: boolean
}

/**
 * Offline pose replay over a saved clip's samples.
 * Media timestamps only — not rVFC, not `performance.now()`.
 * Side is locked for the whole clip; a conscious L/R change is a gap, not a silent flip.
 */
export function replayPoseOverClip(
  frames: readonly PoseFrame[],
  options: Pick<MarkerlessOptions, 'minVisibility' | 'sideLockMs'>,
): PoseReplayResult {
  const ordered = [...frames].sort((a, b) => a.timestampMs - b.timestampMs)
  const lock = new MeasureSideLock({
    minVisibility: options.minVisibility,
    sideLockMs: options.sideLockMs,
  })
  const samples: MarkerlessSample[] = []
  let sideSwitch = false

  for (let i = 0; i < ordered.length; i += 1) {
    const applied = lock.apply(ordered[i]!)
    if (applied.needsNewTake) sideSwitch = true
    samples.push(
      sampleFromPose(ordered[i]!, i, options, applied.lockedSide, applied.accept && !applied.occludedLockedSide),
    )
  }

  return {
    samples,
    lockedSide: lock.locked(),
    sideSwitch,
  }
}
