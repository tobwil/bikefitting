import type { ScaleUnit } from '../types/scale.ts'

export function unitToMm(value: number, unit: ScaleUnit): number {
  if (unit === 'mm') return value
  if (unit === 'cm') return value * 10
  return value * 25.4
}

export function mmToUnit(mm: number, unit: ScaleUnit): number {
  if (unit === 'mm') return mm
  if (unit === 'cm') return mm / 10
  return mm / 25.4
}

export function convertUnit(value: number, from: ScaleUnit, to: ScaleUnit): number {
  if (from === to) return value
  return mmToUnit(unitToMm(value, from), to)
}

export function pixelDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
