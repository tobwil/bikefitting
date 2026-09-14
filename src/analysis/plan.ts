import { LIVE_METRICS_MAX_FRAMES } from './constants.ts'

/**
 * Planned media sample times. Inclusive of 0 and duration.
 * Does not apply `metrics` maxFrames:900 — a 40 s / 30 fps clip stays fully visited.
 */
export function planSampleTimesMs(durationMs: number, targetFps: number): number[] {
  if (!Number.isFinite(durationMs) || durationMs < 0 || !Number.isFinite(targetFps) || targetFps <= 0) {
    return []
  }
  const step = 1000 / targetFps
  const times: number[] = []
  const last = Math.round(durationMs)
  for (let t = 0; t <= last + 0.5; t += step) {
    times.push(Math.round(t))
  }
  if (times.length === 0) return [0]
  if (times[times.length - 1] !== last) times.push(last)
  const unique: number[] = []
  let prev = Number.NaN
  for (const time of times) {
    if (time === prev) continue
    unique.push(time)
    prev = time
  }
  return unique
}

export function plannedFramesExceedLiveCap(durationMs: number, targetFps: number): boolean {
  return planSampleTimesMs(durationMs, targetFps).length > LIVE_METRICS_MAX_FRAMES
}
