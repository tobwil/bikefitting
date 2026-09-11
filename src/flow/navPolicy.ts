import type { FlowStepId } from './constants.ts'
import type { MeasurePhase } from './types.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PixelPoint } from '../types/calibration.ts'

/** Leave countdown/recording must abort — back, stepper, and lab. */
export function shouldAbortCaptureOnLeave(phase: MeasurePhase): boolean {
  return phase === 'countdown' || phase === 'recording'
}

/** Finished captures that were aborted on leave must not auto-open Ergebnis. */
export function shouldAutoCommitResult(opts: {
  phase: MeasurePhase
  captureId: string | null
  committedId: string | null
  ignoredIds: Iterable<string>
}): boolean {
  if (opts.phase !== 'finished' || !opts.captureId) return false
  if (opts.committedId === opts.captureId) return false
  const ignored = opts.ignoredIds instanceof Set ? opts.ignoredIds : new Set(opts.ignoredIds)
  if (ignored.has(opts.captureId)) return false
  return true
}

/**
 * Manual / locked marker is still usable. Lost or idle with no seed
 * cannot stay on Messung (clicks are off there).
 */
export function pedalTrackerValid(
  sample: Pick<PedalSample, 'status' | 'pixel'>,
  seedPoint: PixelPoint | null = null,
): boolean {
  if (sample.status === 'lost') return false
  if (sample.status === 'locked') return true
  if (sample.pixel !== null) return true
  if (seedPoint !== null && sample.status === 'seeding') return true
  return false
}

export function remasureSetupValid(opts: { cameraReady: boolean; calibrateReady: boolean }): boolean {
  return opts.cameraReady && opts.calibrateReady
}

export type RemeasureDestination = 'measure' | 'body'

/** Keep Messung only when setup + tracker are valid; otherwise re-select on Bezug. */
export function remeasureDestination(opts: {
  cameraReady: boolean
  calibrateReady: boolean
  sample: Pick<PedalSample, 'status' | 'pixel'>
  seedPoint: PixelPoint | null
}): RemeasureDestination {
  const setupOk = remasureSetupValid(opts)
  const trackerOk = pedalTrackerValid(opts.sample, opts.seedPoint)
  return setupOk && trackerOk ? 'measure' : 'body'
}

/**
 * Standbild is calib-only in the product flow. Lab keeps it because the
 * calibration panel stays on screen.
 */
export function stillCanvasVisible(opts: {
  frozen: boolean
  step: FlowStepId | string
  mode: 'flow' | 'lab' | string
}): boolean {
  if (!opts.frozen) return false
  if (opts.mode === 'lab') return true
  return opts.step === 'calibrate'
}
