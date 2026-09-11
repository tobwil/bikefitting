import type { CaptureState, MetricsFrame, MetricsPipelineOptions, MetricsReport } from '../types/metrics.ts'
import { createMetricsPipeline, emptyMetricsReport, type MetricsPipeline } from './pipeline.ts'

export const DEFAULT_CAPTURE_COUNTDOWN_SEC = 3
export const DEFAULT_CAPTURE_TARGET_REVS = 10

export type MeasurementSnapshot = {
  id: string | null
  state: CaptureState
  countdownRemainingSec: number
  countdownDisplay: number
  targetRevs: number
  report: MetricsReport
  frozen: boolean
  abortReason: string | null
}

export type MeasurementCaptureOptions = {
  targetRevs?: number
  countdownSeconds?: number
  now?: () => number
  idFactory?: () => string
  pipeline?: Partial<MetricsPipelineOptions>
}

export type MeasurementCapture = {
  snapshot(): MeasurementSnapshot
  startCountdown(nowMs?: number, seconds?: number): MeasurementSnapshot
  tick(nowMs?: number): MeasurementSnapshot
  beginRecording(): MeasurementSnapshot
  push(frame: MetricsFrame): MeasurementSnapshot
  finish(): MeasurementSnapshot
  abort(reason?: string): MeasurementSnapshot
  reset(): MeasurementSnapshot
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `meas-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/**
 * One measurement attempt with an explicit id and capture states.
 *
 * Preview frames must not be pushed here. The aggregator is created empty
 * only when countdown ends (`beginRecording`). Finished reports are frozen
 * atomically when `targetRevs` valid revolutions are reached.
 */
export function createMeasurementCapture(
  options: MeasurementCaptureOptions = {},
): MeasurementCapture {
  const clock = options.now ?? defaultNow
  const newId = options.idFactory ?? defaultId
  let targetRevs = options.targetRevs ?? DEFAULT_CAPTURE_TARGET_REVS
  let countdownSeconds = options.countdownSeconds ?? DEFAULT_CAPTURE_COUNTDOWN_SEC
  let state: CaptureState = 'ready'
  let id: string | null = null
  let countdownStartedAtMs: number | null = null
  let countdownRemainingSec = countdownSeconds
  let abortReason: string | null = null
  let frozen: MetricsReport | null = null
  let pipeline: MetricsPipeline | null = null

  const openEmptyPipeline = () => {
    pipeline = createMetricsPipeline(options.pipeline)
    frozen = null
  }

  const liveReport = (): MetricsReport => {
    if (frozen) return frozen
    if (pipeline) return pipeline.snapshot()
    return emptyMetricsReport()
  }

  const remainingAt = (nowMs: number): number => {
    if (state !== 'countdown' || countdownStartedAtMs === null) {
      return state === 'countdown' ? countdownRemainingSec : countdownSeconds
    }
    return Math.max(0, countdownSeconds - (nowMs - countdownStartedAtMs) / 1000)
  }

  const snapshot = (): MeasurementSnapshot => {
    const remaining = state === 'countdown' ? countdownRemainingSec : state === 'ready' ? countdownSeconds : 0
    return {
      id,
      state,
      countdownRemainingSec: remaining,
      countdownDisplay: Math.ceil(remaining),
      targetRevs,
      report: liveReport(),
      frozen: frozen !== null,
      abortReason,
    }
  }

  const clearAggregator = () => {
    pipeline = null
    frozen = null
  }

  const beginRecording = (): MeasurementSnapshot => {
    if (state === 'finished' && frozen) return snapshot()
    if (!id) id = newId()
    abortReason = null
    openEmptyPipeline()
    state = 'recording'
    countdownStartedAtMs = null
    countdownRemainingSec = 0
    return snapshot()
  }

  const maybeFreeze = (report: MetricsReport) => {
    if (state !== 'recording' || frozen) return
    if (report.validRevolutions >= targetRevs) {
      frozen = report
      state = 'finished'
      pipeline = null
    }
  }

  return {
    snapshot,
    startCountdown(nowMs, seconds) {
      const now = nowMs ?? clock()
      if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0) {
        countdownSeconds = seconds
      }
      id = newId()
      abortReason = null
      clearAggregator()
      state = 'countdown'
      countdownStartedAtMs = now
      countdownRemainingSec = countdownSeconds
      return snapshot()
    },
    tick(nowMs) {
      if (state !== 'countdown') return snapshot()
      const now = nowMs ?? clock()
      countdownRemainingSec = remainingAt(now)
      if (countdownRemainingSec <= 0) {
        return beginRecording()
      }
      return snapshot()
    },
    beginRecording,
    push(frame) {
      if (state !== 'recording' || frozen || !pipeline) return snapshot()
      pipeline.push(frame)
      maybeFreeze(pipeline.snapshot())
      return snapshot()
    },
    finish() {
      if (state === 'finished' && frozen) return snapshot()
      if (state !== 'recording') {
        if (state === 'countdown' || state === 'ready') {
          state = 'aborted'
          abortReason = abortReason ?? 'finish_without_recording'
          clearAggregator()
        }
        return snapshot()
      }
      frozen = liveReport()
      state = 'finished'
      pipeline = null
      return snapshot()
    },
    abort(reason = 'aborted') {
      if (state === 'finished' && frozen) {
        abortReason = reason
        return snapshot()
      }
      abortReason = reason
      clearAggregator()
      state = 'aborted'
      countdownStartedAtMs = null
      countdownRemainingSec = 0
      return snapshot()
    },
    reset() {
      id = null
      abortReason = null
      clearAggregator()
      state = 'ready'
      countdownStartedAtMs = null
      countdownRemainingSec = countdownSeconds
      return snapshot()
    },
  }
}

export function emptyMeasurementSnapshot(targetRevs = DEFAULT_CAPTURE_TARGET_REVS): MeasurementSnapshot {
  return {
    id: null,
    state: 'ready',
    countdownRemainingSec: DEFAULT_CAPTURE_COUNTDOWN_SEC,
    countdownDisplay: DEFAULT_CAPTURE_COUNTDOWN_SEC,
    targetRevs,
    report: emptyMetricsReport(),
    frozen: false,
    abortReason: null,
  }
}
