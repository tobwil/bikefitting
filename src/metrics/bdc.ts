import { unwrapDeltaDeg } from '../pedal/geometry.ts'
import type { MetricsPipelineOptions } from '../types/metrics.ts'

/**
 * Knee at bottom dead centre (BDC).
 *
 * Crank convention (`pedal/geometry.crankAngleDeg`):
 *   0°   = top dead centre (TDC) — marker above the bottom bracket
 *   +deg = toward bike +X
 *   180° = bottom dead centre (BDC)
 *
 * Window: crank samples whose shortest-arc distance to 180° is
 *   ≤ `bdcWindowHalfDeg` (default 12° → inclusive [168°, 192°]).
 *
 * Interpolation (in crank-angle space, not time):
 *   1. A sample within 0.5° of 180° is used as-is.
 *   2. Otherwise the closest sample before 180° and after 180° inside the
 *      window are linearly interpolated onto exactly 180°.
 *   3. If only one side is present, the nearest in-window sample is used.
 *
 * Visibility: a sample contributes only when hip / knee / ankle passed the
 * caller’s visibility filter (the degree value is already null otherwise).
 * A cycle with no in-window visible sample has insufficient BDC coverage.
 *
 * This is not a cycle-mean. Cycle-mean is a separate metric.
 */
export const BDC_ANGLE_DEG = 180
export const BDC_WINDOW_HALF_DEG = 12
export const BDC_EXACT_HALF_DEG = 0.5

export type BdcSample = {
  angleDeg: number
  valueDeg: number
}

export type BdcEstimate = {
  valueDeg: number
  interpolation: 'exact' | 'lerp' | 'nearest'
  windowHalfDeg: number
  samplesInWindow: number
}

export function crankDistanceToBdc(angleDeg: number, bdcAngleDeg = BDC_ANGLE_DEG): number {
  return Math.abs(unwrapDeltaDeg(bdcAngleDeg, angleDeg))
}

export function inBdcWindow(
  angleDeg: number,
  windowHalfDeg = BDC_WINDOW_HALF_DEG,
  bdcAngleDeg = BDC_ANGLE_DEG,
): boolean {
  return crankDistanceToBdc(angleDeg, bdcAngleDeg) <= windowHalfDeg
}

function closest(
  samples: readonly BdcSample[],
  bdcAngleDeg: number,
): BdcSample | null {
  let best: BdcSample | null = null
  let bestDist = Infinity
  for (const sample of samples) {
    const dist = crankDistanceToBdc(sample.angleDeg, bdcAngleDeg)
    if (dist < bestDist) {
      best = sample
      bestDist = dist
    }
  }
  return best
}

/**
 * Estimate the metric at BDC from in-window samples of one crank cycle.
 * Returns null when the window has no visible samples (insufficient BDC).
 */
export function estimateAtBdc(
  samples: readonly BdcSample[],
  options?: Pick<Partial<MetricsPipelineOptions>, 'bdcAngleDeg' | 'bdcWindowHalfDeg'>,
): BdcEstimate | null {
  const bdcAngleDeg = options?.bdcAngleDeg ?? BDC_ANGLE_DEG
  const windowHalfDeg = options?.bdcWindowHalfDeg ?? BDC_WINDOW_HALF_DEG
  const inWindow = samples.filter((sample) =>
    inBdcWindow(sample.angleDeg, windowHalfDeg, bdcAngleDeg),
  )
  if (inWindow.length === 0) return null

  const exact = inWindow.find(
    (sample) => crankDistanceToBdc(sample.angleDeg, bdcAngleDeg) <= BDC_EXACT_HALF_DEG,
  )
  if (exact) {
    return {
      valueDeg: exact.valueDeg,
      interpolation: 'exact',
      windowHalfDeg,
      samplesInWindow: inWindow.length,
    }
  }

  const before: BdcSample[] = []
  const after: BdcSample[] = []
  for (const sample of inWindow) {
    const deltaToBdc = unwrapDeltaDeg(sample.angleDeg, bdcAngleDeg)
    if (deltaToBdc > 0) before.push(sample)
    else if (deltaToBdc < 0) after.push(sample)
  }

  const prev = closest(before, bdcAngleDeg)
  const next = closest(after, bdcAngleDeg)
  if (prev && next) {
    const d0 = unwrapDeltaDeg(prev.angleDeg, bdcAngleDeg)
    const d1 = unwrapDeltaDeg(bdcAngleDeg, next.angleDeg)
    const span = d0 + d1
    const t = span === 0 ? 0 : d0 / span
    return {
      valueDeg: prev.valueDeg + t * (next.valueDeg - prev.valueDeg),
      interpolation: 'lerp',
      windowHalfDeg,
      samplesInWindow: inWindow.length,
    }
  }

  const nearest = closest(inWindow, bdcAngleDeg)
  if (!nearest) return null
  return {
    valueDeg: nearest.valueDeg,
    interpolation: 'nearest',
    windowHalfDeg,
    samplesInWindow: inWindow.length,
  }
}
