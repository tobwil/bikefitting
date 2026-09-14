/** Versioned markerless defaults. Do not silently reuse expert BDC min-cycle = 3. */

export const MARKERLESS_MIN_VISIBILITY = 0.75
export const MARKERLESS_MIN_VALID_CYCLES = 10
export const MARKERLESS_MIN_SAMPLES_PER_CYCLE = 8
export const MARKERLESS_MIN_ANGLE_SAMPLES_PER_CYCLE = 4
export const MARKERLESS_MIN_VISIBLE_FRACTION = 0.5
export const MARKERLESS_MAX_FRAME_GAP_MS = 400
/** Beginner cadence band. AP-09 may tighten; changing it requires a new methodVersion. */
export const MARKERLESS_MIN_CADENCE_RPM = 40
export const MARKERLESS_MAX_CADENCE_RPM = 120
export const MARKERLESS_MIN_CYCLE_MS = Math.round(60_000 / MARKERLESS_MAX_CADENCE_RPM)
export const MARKERLESS_MAX_CYCLE_MS = Math.round(60_000 / MARKERLESS_MIN_CADENCE_RPM)
/** Normalized image units (0–1). Hip travel above this is mount/dismount/walk, not pedaling. */
export const MARKERLESS_HIP_MAX_SPEED_PER_SEC = 0.18
/** Below this unwrap rate the leg is treated as still. 40 rpm ≈ 240°/s. */
export const MARKERLESS_STILL_UNWRAP_DEG_PER_SEC = 40
export const MARKERLESS_MIN_RADIUS_AMPLITUDE = 0.02
export const MARKERLESS_MIN_RADIUS = 0.04
/** Consecutive raw flexion jump treated as a data gap, not interpolated. */
export const MARKERLESS_MAX_FLEXION_JUMP_DEG = 40
/** Fraction of cycle duration around the raw minimum that must be sampled. */
export const MARKERLESS_EXTENSION_WINDOW_FRACTION = 0.2
export const MARKERLESS_MIN_EXTENSION_SAMPLES = 3
export const MARKERLESS_SIDE_LOCK_MS = 0
export const MARKERLESS_P10_QUANTILE = 0.1

export type MarkerlessOptions = {
  minVisibility: number
  minValidCycles: number
  minSamplesPerCycle: number
  minAngleSamplesPerCycle: number
  minVisibleFraction: number
  maxFrameGapMs: number
  minCadenceRpm: number
  maxCadenceRpm: number
  hipMaxSpeedPerSec: number
  stillUnwrapDegPerSec: number
  minRadiusAmplitude: number
  minRadius: number
  maxFlexionJumpDeg: number
  extensionWindowFraction: number
  minExtensionSamples: number
  sideLockMs: number
  p10Quantile: number
}

export const DEFAULT_MARKERLESS_OPTIONS: MarkerlessOptions = {
  minVisibility: MARKERLESS_MIN_VISIBILITY,
  minValidCycles: MARKERLESS_MIN_VALID_CYCLES,
  minSamplesPerCycle: MARKERLESS_MIN_SAMPLES_PER_CYCLE,
  minAngleSamplesPerCycle: MARKERLESS_MIN_ANGLE_SAMPLES_PER_CYCLE,
  minVisibleFraction: MARKERLESS_MIN_VISIBLE_FRACTION,
  maxFrameGapMs: MARKERLESS_MAX_FRAME_GAP_MS,
  minCadenceRpm: MARKERLESS_MIN_CADENCE_RPM,
  maxCadenceRpm: MARKERLESS_MAX_CADENCE_RPM,
  hipMaxSpeedPerSec: MARKERLESS_HIP_MAX_SPEED_PER_SEC,
  stillUnwrapDegPerSec: MARKERLESS_STILL_UNWRAP_DEG_PER_SEC,
  minRadiusAmplitude: MARKERLESS_MIN_RADIUS_AMPLITUDE,
  minRadius: MARKERLESS_MIN_RADIUS,
  maxFlexionJumpDeg: MARKERLESS_MAX_FLEXION_JUMP_DEG,
  extensionWindowFraction: MARKERLESS_EXTENSION_WINDOW_FRACTION,
  minExtensionSamples: MARKERLESS_MIN_EXTENSION_SAMPLES,
  sideLockMs: MARKERLESS_SIDE_LOCK_MS,
  p10Quantile: MARKERLESS_P10_QUANTILE,
}

export function resolveMarkerlessOptions(
  options?: Partial<MarkerlessOptions>,
): MarkerlessOptions {
  return { ...DEFAULT_MARKERLESS_OPTIONS, ...options }
}

export function cycleMsBounds(options: MarkerlessOptions): { minMs: number; maxMs: number } {
  return {
    minMs: Math.round(60_000 / options.maxCadenceRpm),
    maxMs: Math.round(60_000 / options.minCadenceRpm),
  }
}
