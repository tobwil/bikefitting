import type { CameraNearSide, PoseFrame } from '../types/landmarks.ts'
import type {
  AnalysisExcludedSpan,
  AnalysisExcludeReason,
  AnalysisPoseSample,
  AnalysisSelectedSegment,
} from '../types/analysis.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import {
  CAMERA_HIP_SPEED,
  MIN_PEDAL_SPAN_MS,
  MIN_PERIODIC_CYCLES_IN_WINDOW,
  MIN_WINDOW_SAMPLES,
  PEDAL_PERIOD_MAX_MS,
  PEDAL_PERIOD_MIN_MS,
  SEGMENT_WINDOW_MS,
  STILL_ANKLE_SPEED,
} from './constants.ts'

export type SegmentLabel = AnalysisExcludeReason | 'pedaling'

type Point = { t: number; relY: number; hipX: number; hipY: number; side: CameraNearSide | null; ok: boolean }

function sideOf(pose: PoseFrame | null, minVisibility: number): CameraNearSide | null {
  if (!pose) return null
  return pose.nearSide ?? inferNearSide(pose.landmarks, minVisibility) ?? null
}

function samplePoint(sample: AnalysisPoseSample, minVisibility: number): Point {
  const pose = sample.pose
  const side = sideOf(pose, minVisibility)
  if (!pose || !side) {
    return { t: sample.mediaTimeMs, relY: 0, hipX: 0, hipY: 0, side, ok: false }
  }
  const hip = visibleJoint(pose.landmarks, side, 'HIP', minVisibility)
  const ankle = visibleJoint(pose.landmarks, side, 'ANKLE', minVisibility)
  const knee = visibleJoint(pose.landmarks, side, 'KNEE', minVisibility)
  if (!hip || !ankle || !knee) {
    return { t: sample.mediaTimeMs, relY: 0, hipX: hip?.x ?? 0, hipY: hip?.y ?? 0, side, ok: false }
  }
  return { t: sample.mediaTimeMs, relY: ankle.y - hip.y, hipX: hip.x, hipY: hip.y, side, ok: true }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function periodMsInWindow(points: Point[]): number | null {
  const ok = points.filter((row) => row.ok)
  if (ok.length < MIN_WINDOW_SAMPLES) return null
  const mean = ok.reduce((sum, row) => sum + row.relY, 0) / ok.length
  const crossings: number[] = []
  for (let i = 1; i < ok.length; i += 1) {
    const prev = ok[i - 1]!.relY - mean
    const next = ok[i]!.relY - mean
    if (prev === 0 || next === 0) continue
    if (prev < 0 !== next < 0) crossings.push(ok[i]!.t)
  }
  if (crossings.length < MIN_PERIODIC_CYCLES_IN_WINDOW * 2) return null
  const halves: number[] = []
  for (let i = 1; i < crossings.length; i += 1) {
    halves.push(crossings[i]! - crossings[i - 1]!)
  }
  const period = median(halves) * 2
  if (period < PEDAL_PERIOD_MIN_MS || period > PEDAL_PERIOD_MAX_MS) return null
  return period
}

function windowAround(points: Point[], index: number): Point[] {
  const center = points[index]!.t
  const half = SEGMENT_WINDOW_MS / 2
  return points.filter((row) => Math.abs(row.t - center) <= half)
}

function collapseSpans(labels: { t: number; label: SegmentLabel }[]): AnalysisExcludedSpan[] {
  const out: AnalysisExcludedSpan[] = []
  for (const row of labels) {
    if (row.label === 'pedaling') continue
    const last = out[out.length - 1]
    if (last && last.reason === row.label) {
      last.endMs = row.t
    } else {
      out.push({ startMs: row.t, endMs: row.t, reason: row.label })
    }
  }
  return out
}

function longestPedalingRun(
  labels: { t: number; label: SegmentLabel; side: CameraNearSide | null }[],
): AnalysisSelectedSegment | null {
  let best: AnalysisSelectedSegment | null = null
  let start = 0
  while (start < labels.length) {
    if (labels[start]!.label !== 'pedaling') {
      start += 1
      continue
    }
    const side = labels[start]!.side
    let end = start
    while (
      end + 1 < labels.length &&
      labels[end + 1]!.label === 'pedaling' &&
      labels[end + 1]!.side === side
    ) {
      end += 1
    }
    const startMs = labels[start]!.t
    const endMs = labels[end]!.t
    const duration = endMs - startMs
    if (duration >= MIN_PEDAL_SPAN_MS && (!best || duration > best.endMs - best.startMs)) {
      best = { startMs, endMs, side, sampleCount: end - start + 1 }
    }
    start = end + 1
  }
  return best
}

function closePedalingHoles(
  labels: SegmentLabel[],
  times: number[],
  maxHoleMs: number,
): SegmentLabel[] {
  const out = [...labels]
  let prevPedal = -1
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] !== 'pedaling') continue
    if (prevPedal >= 0 && times[i]! - times[prevPedal]! <= maxHoleMs) {
      for (let j = prevPedal + 1; j < i; j += 1) {
        if (out[j] === 'insufficient_pose' || out[j] === 'camera_motion' || out[j] === 'side_switch') continue
        out[j] = 'pedaling'
      }
    }
    prevPedal = i
  }
  return out
}

function firstPedalingIndex(labels: { label: SegmentLabel }[]): number {
  return labels.findIndex((row) => row.label === 'pedaling')
}

function lastPedalingIndex(labels: { label: SegmentLabel }[]): number {
  for (let i = labels.length - 1; i >= 0; i -= 1) {
    if (labels[i]!.label === 'pedaling') return i
  }
  return -1
}

/**
 * Split mount / dismount / stillstand from a contiguous pedaling span.
 * Does not glue non-contiguous good frames. No mandatory manual trim.
 */
export function selectPedalingSegment(
  samples: readonly AnalysisPoseSample[],
  minVisibility: number,
): { selected: AnalysisSelectedSegment | null; excluded: AnalysisExcludedSpan[]; labels: SegmentLabel[] } {
  if (samples.length === 0) {
    return { selected: null, excluded: [], labels: [] }
  }
  const points = samples.map((sample) => samplePoint(sample, minVisibility))
  const raw: SegmentLabel[] = points.map((point, index) => {
    if (!point.ok) return 'insufficient_pose'
    if (index === 0) {
      const period0 = periodMsInWindow(windowAround(points, 0))
      return period0 != null ? 'pedaling' : 'stillstand'
    }
    const prev = points[index - 1]!
    const dt = Math.max(1, point.t - prev.t) / 1000
    const ankleSpeed = Math.abs(point.relY - prev.relY) / dt
    const hipSpeed = Math.hypot(point.hipX - prev.hipX, point.hipY - prev.hipY) / dt
    if (hipSpeed >= CAMERA_HIP_SPEED && hipSpeed > ankleSpeed * 1.15) return 'camera_motion'
    const period = periodMsInWindow(windowAround(points, index))
    if (period != null) return 'pedaling'
    if (!prev.ok) return 'insufficient_pose'
    if (ankleSpeed < STILL_ANKLE_SPEED && hipSpeed < STILL_ANKLE_SPEED) return 'stillstand'
    return 'unsteady'
  })
  const filled = closePedalingHoles(
    raw,
    points.map((point) => point.t),
    450,
  )

  const firstPedal = firstPedalingIndex(filled.map((label) => ({ label })))
  const lastPedal = lastPedalingIndex(filled.map((label) => ({ label })))
  const labels: SegmentLabel[] = filled.map((label, index) => {
    if (label === 'pedaling' || label === 'stillstand' || label === 'insufficient_pose' || label === 'camera_motion') {
      return label
    }
    if (label === 'unsteady' && firstPedal >= 0 && index < firstPedal) return 'mount'
    if (label === 'unsteady' && lastPedal >= 0 && index > lastPedal) return 'dismount'
    return label
  })

  const tagged = labels.map((label, index) => ({
    t: points[index]!.t,
    label,
    side: points[index]!.side,
  }))
  const selected = longestPedalingRun(tagged)
  if (selected) {
    for (let i = 0; i < tagged.length; i += 1) {
      const t = tagged[i]!.t
      if (t >= selected.startMs && t <= selected.endMs && tagged[i]!.side !== selected.side && tagged[i]!.label === 'pedaling') {
        tagged[i]!.label = 'side_switch'
        labels[i] = 'side_switch'
      }
    }
  }

  return {
    selected: longestPedalingRun(tagged),
    excluded: collapseSpans(tagged),
    labels,
  }
}

export function samplesInSegment(
  samples: readonly AnalysisPoseSample[],
  selected: AnalysisSelectedSegment | null,
): AnalysisPoseSample[] {
  if (!selected) return []
  return samples.filter((row) => row.mediaTimeMs >= selected.startMs && row.mediaTimeMs <= selected.endMs)
}
