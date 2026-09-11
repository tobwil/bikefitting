/** Sorted copy; caller guarantees length ≥ 1. */
function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

export function mean(values: readonly number[]): number {
  let s = 0
  for (const v of values) s += v
  return s / values.length
}

export function median(values: readonly number[]): number {
  const s = sorted(values)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Linear interpolation quantile on a sorted copy. `q` in [0, 1]. */
export function quantile(values: readonly number[], q: number): number {
  const s = sorted(values)
  if (s.length === 1) return s[0]!
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]!
  return s[lo]! * (hi - pos) + s[hi]! * (pos - lo)
}

/** Interquartile range (q75 − q25). Zero when n < 2. */
export function iqr(values: readonly number[]): number {
  if (values.length < 2) return 0
  return quantile(values, 0.75) - quantile(values, 0.25)
}

export function minMax(values: readonly number[]): { min: number; max: number } {
  let min = values[0]!
  let max = values[0]!
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i]!
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
