import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import type { CameraNearSide, Landmark, PoseFrame } from '../types/landmarks.ts'
import { POSE_LOST_MS } from './freshness.ts'
import { inferNearSide, isLandmarkVisible, visibleJoint } from './nearSide.ts'
import { OneEuroFilter } from './vendor/casiez-oneeurofilter/OneEuroFilter.ts'

/**
 * Casiez 1€ defaults for overlay compare. `freqHz` is only the first-sample
 * guess — each later call passes a timestamp so the filter updates Hz from dt.
 * Not a fixed 30 Hz clock.
 */
export const OVERLAY_FILTER_PARAMS = {
  freqHz: 60,
  minCutoffHz: 1.0,
  beta: 0.35,
  dCutoffHz: 1.0,
  minVisibility: MIN_LANDMARK_VISIBILITY,
  sideLockMs: 160,
} as const

export type OverlayFilterParams = typeof OVERLAY_FILTER_PARAMS

const LOCK_JOINTS = ['SHOULDER', 'HIP', 'KNEE'] as const

export type OverlayFilterStatus = {
  usedFilter: boolean
  lockedSide: CameraNearSide | null
  needsNewTake: boolean
  occludedNearSide: boolean
  filteredJointCount: number
  skippedMissing: number
}

export type OverlayFilterApply = OverlayFilterStatus & {
  frame: PoseFrame | null
}

type JointFilters = { x: OneEuroFilter; y: OneEuroFilter }

function otherSide(side: CameraNearSide): CameraNearSide {
  return side === 'left' ? 'right' : 'left'
}

function chainMeasurable(
  landmarks: Landmark[],
  side: CameraNearSide,
  minVisibility: number,
): boolean {
  let n = 0
  for (const joint of LOCK_JOINTS) {
    if (visibleJoint(landmarks, side, joint, minVisibility)) n += 1
  }
  return n >= 2
}

function newScalarFilter(params: OverlayFilterParams): OneEuroFilter {
  return new OneEuroFilter(params.freqHz, params.minCutoffHz, params.beta, params.dCutoffHz)
}

/** Metrics and phase stills always consume the raw frame — never the overlay. */
export function poseForMetrics(raw: PoseFrame | null, _filtered?: PoseFrame | null): PoseFrame | null {
  return raw
}

export function overlayFilterFromSearch(search = ''): boolean {
  return new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('overlayFilter') === '1'
}

/**
 * Timestamp-based 1€ overlay. Missing joints stay missing. Near-side is
 * locked after a short hold; a later L/R flip is a new take, not a mix.
 */
export class OverlayPoseFilter {
  private readonly params: OverlayFilterParams
  private readonly joints = new Map<number, JointFilters>()
  private lockedSide: CameraNearSide | null = null
  private pendingSide: CameraNearSide | null = null
  private pendingSinceMs: number | null = null
  private needsNewTake = false
  private lastTimestampMs: number | null = null

  constructor(params: OverlayFilterParams = OVERLAY_FILTER_PARAMS) {
    this.params = params
  }

  reset(): void {
    this.joints.clear()
    this.lockedSide = null
    this.pendingSide = null
    this.pendingSinceMs = null
    this.needsNewTake = false
    this.lastTimestampMs = null
  }

  status(): OverlayFilterStatus {
    return {
      usedFilter: false,
      lockedSide: this.lockedSide,
      needsNewTake: this.needsNewTake,
      occludedNearSide: false,
      filteredJointCount: 0,
      skippedMissing: 0,
    }
  }

  apply(frame: PoseFrame | null): OverlayFilterApply {
    if (!frame || frame.landmarks.length === 0) {
      this.reset()
      return { frame: null, ...this.status() }
    }

    if (this.lastTimestampMs !== null) {
      const gap = frame.timestampMs - this.lastTimestampMs
      if (gap < 0 || gap >= POSE_LOST_MS) this.reset()
    }
    this.lastTimestampMs = frame.timestampMs

    const instant = frame.nearSide ?? inferNearSide(frame.landmarks, this.params.minVisibility)
    this.updateSideLock(instant, frame.timestampMs)

    const occludedNearSide = this.lockedSide
      ? !chainMeasurable(frame.landmarks, this.lockedSide, this.params.minVisibility)
      : false
    const otherVisible = this.lockedSide
      ? chainMeasurable(frame.landmarks, otherSide(this.lockedSide), this.params.minVisibility)
      : false
    if (occludedNearSide && otherVisible) this.needsNewTake = true

    const tSec = frame.timestampMs / 1000
    let filteredJointCount = 0
    let skippedMissing = 0
    const landmarks = frame.landmarks.map((lm, index) => {
      const next = this.filterLandmark(index, lm, tSec)
      if (!isLandmarkVisible(lm, this.params.minVisibility)) skippedMissing += 1
      else filteredJointCount += 1
      return next
    })

    const nearSide = this.lockedSide ?? instant
    return {
      frame: { ...frame, landmarks, nearSide },
      usedFilter: true,
      lockedSide: this.lockedSide,
      needsNewTake: this.needsNewTake,
      occludedNearSide,
      filteredJointCount,
      skippedMissing,
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
    if (this.pendingSinceMs !== null && timestampMs - this.pendingSinceMs >= this.params.sideLockMs) {
      this.lockedSide = instant
    }
  }

  private filterLandmark(index: number, lm: Landmark, timestampSec: number): Landmark {
    if (!isLandmarkVisible(lm, this.params.minVisibility)) {
      this.joints.delete(index)
      return { ...lm }
    }
    let filters = this.joints.get(index)
    if (!filters) {
      filters = { x: newScalarFilter(this.params), y: newScalarFilter(this.params) }
      this.joints.set(index, filters)
    }
    return {
      ...lm,
      x: filters.x.filter(lm.x, timestampSec),
      y: filters.y.filter(lm.y, timestampSec),
      visibility: lm.visibility,
    }
  }
}

export const EMPTY_OVERLAY_FILTER_STATUS: OverlayFilterStatus = {
  usedFilter: false,
  lockedSide: null,
  needsNewTake: false,
  occludedNearSide: false,
  filteredJointCount: 0,
  skippedMissing: 0,
}
