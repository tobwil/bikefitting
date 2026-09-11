import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import type { CameraNearSide, PoseFrame } from '../types/landmarks.ts'
import { inferNearSide, visibleJoint } from './nearSide.ts'
import { OVERLAY_FILTER_PARAMS } from './overlayFilter.ts'

const LOCK_JOINTS = ['SHOULDER', 'HIP', 'KNEE'] as const

export type MeasureSideStatus = {
  lockedSide: CameraNearSide | null
  needsNewTake: boolean
  occludedLockedSide: boolean
}

export type MeasureSideApply = MeasureSideStatus & {
  /** Raw landmark coords; `nearSide` stamped to the locked chain when locked. */
  pose: PoseFrame | null
  /** False until a side is locked, or when the caller should not mix sides. */
  accept: boolean
}

function otherSide(side: CameraNearSide): CameraNearSide {
  return side === 'left' ? 'right' : 'left'
}

export function chainMeasurable(
  landmarks: PoseFrame['landmarks'],
  side: CameraNearSide,
  minVisibility: number,
): boolean {
  let n = 0
  for (const joint of LOCK_JOINTS) {
    if (visibleJoint(landmarks, side, joint, minVisibility)) n += 1
  }
  return n >= 2
}

function stampLockedSide(raw: PoseFrame, side: CameraNearSide): PoseFrame {
  return { ...raw, nearSide: side }
}

/**
 * Capture-scoped L/R lock for metrics / foot / phases.
 * Independent of the lab 1€ overlay toggle. Coords stay raw; only the
 * locked joint chain is eligible. Loss of that chain locks data (no silent
 * flip). A conscious side change resets the lock and is a new take.
 */
export class MeasureSideLock {
  private lockedSide: CameraNearSide | null = null
  private pendingSide: CameraNearSide | null = null
  private pendingSinceMs: number | null = null
  private needsNewTake = false
  private readonly minVisibility: number
  private readonly sideLockMs: number

  constructor(
    opts: { minVisibility?: number; sideLockMs?: number } = {},
  ) {
    this.minVisibility = opts.minVisibility ?? MIN_LANDMARK_VISIBILITY
    this.sideLockMs = opts.sideLockMs ?? OVERLAY_FILTER_PARAMS.sideLockMs
  }

  reset(): void {
    this.lockedSide = null
    this.pendingSide = null
    this.pendingSinceMs = null
    this.needsNewTake = false
  }

  status(): MeasureSideStatus {
    return {
      lockedSide: this.lockedSide,
      needsNewTake: this.needsNewTake,
      occludedLockedSide: false,
    }
  }

  locked(): CameraNearSide | null {
    return this.lockedSide
  }

  /**
   * Conscious side change — caller must open a new take / segment.
   * Does not mix the new chain into the previous take.
   */
  changeSide(side: CameraNearSide): void {
    this.reset()
    this.lockedSide = side
  }

  apply(raw: PoseFrame | null): MeasureSideApply {
    if (!raw || raw.landmarks.length === 0) {
      return {
        pose: null,
        accept: false,
        lockedSide: this.lockedSide,
        needsNewTake: this.needsNewTake,
        occludedLockedSide: Boolean(this.lockedSide),
      }
    }

    const instant = raw.nearSide ?? inferNearSide(raw.landmarks, this.minVisibility)
    this.updateSideLock(instant, raw.timestampMs)

    if (!this.lockedSide) {
      return {
        pose: raw,
        accept: false,
        lockedSide: null,
        needsNewTake: this.needsNewTake,
        occludedLockedSide: false,
      }
    }

    const occludedLockedSide = !chainMeasurable(raw.landmarks, this.lockedSide, this.minVisibility)
    const otherVisible = chainMeasurable(raw.landmarks, otherSide(this.lockedSide), this.minVisibility)
    if (occludedLockedSide && otherVisible) this.needsNewTake = true

    return {
      pose: stampLockedSide(raw, this.lockedSide),
      accept: true,
      lockedSide: this.lockedSide,
      needsNewTake: this.needsNewTake,
      occludedLockedSide,
    }
  }

  private updateSideLock(instant: CameraNearSide | undefined, timestampMs: number): void {
    if (this.lockedSide) return
    if (!instant) {
      this.pendingSide = null
      this.pendingSinceMs = null
      return
    }
    if (this.pendingSide !== instant) {
      this.pendingSide = instant
      this.pendingSinceMs = timestampMs
      return
    }
    if (this.pendingSinceMs !== null && timestampMs - this.pendingSinceMs >= this.sideLockMs) {
      this.lockedSide = instant
    }
  }
}

export const EMPTY_MEASURE_SIDE_STATUS: MeasureSideStatus = {
  lockedSide: null,
  needsNewTake: false,
  occludedLockedSide: false,
}
