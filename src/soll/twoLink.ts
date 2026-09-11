import type { PixelPoint } from '../types/calibration.ts'

const REACH_EPS = 1
const LEN_EPS = 0.75

export type TwoLinkHit = {
  mid: PixelPoint
  other: PixelPoint
  colinear: boolean
}

/**
 * Place the middle joint of a 2-link chain A — L1 — mid — L2 — C.
 * Returns null instead of stretching L1/L2 when C is out of reach.
 */
export function twoLink(
  a: PixelPoint,
  c: PixelPoint,
  l1: number,
  l2: number,
): TwoLinkHit | null {
  if (!(l1 > 0) || !(l2 > 0)) return null
  const dx = c.x - a.x
  const dy = c.y - a.y
  const d = Math.hypot(dx, dy)
  const maxReach = l1 + l2
  const minReach = Math.abs(l1 - l2)
  if (d > maxReach + REACH_EPS || d < minReach - REACH_EPS) return null

  const dUsed = clamp(d, minReach, maxReach)
  if (dUsed < 1e-6) {
    const mid = { x: a.x + l1, y: a.y }
    return { mid, other: mid, colinear: true }
  }

  const ux = dx / d
  const uy = dy / d
  const x = (dUsed * dUsed + l1 * l1 - l2 * l2) / (2 * dUsed)
  const hSq = Math.max(0, l1 * l1 - x * x)
  const h = Math.sqrt(hSq)
  const px = -uy
  const py = ux
  const baseX = a.x + ux * x
  const baseY = a.y + uy * x
  const mid = { x: baseX + px * h, y: baseY + py * h }
  const other = { x: baseX - px * h, y: baseY - py * h }
  return { mid, other, colinear: h < 1e-4 }
}

export function pickByScore(
  a: PixelPoint,
  b: PixelPoint,
  score: (p: PixelPoint) => number,
): PixelPoint {
  return score(a) >= score(b) ? a : b
}

export function segmentLengthOk(a: PixelPoint, b: PixelPoint, expected: number): boolean {
  return Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - expected) <= LEN_EPS
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
