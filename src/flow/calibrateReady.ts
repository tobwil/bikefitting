import type { DetectPhase, DetectSession } from '../calibration/propose.ts'

export type CalibrateReadyInput = {
  /** Geometry / binding only — not generation identity. */
  assessmentOk: boolean
  appliedGeneration: number | null | undefined
  detectPhase: DetectPhase
  detectGeneration: number
}

/**
 * Flow gate for Messung. Geometry alone is not enough: a new capture
 * (new image generation) invalidates the applied setup until B/S/G are
 * confirmed for that capture. Abort restores the previous detect session
 * (conscious return to the old setup) instead of confirming old coords
 * under the new still.
 */
export function isCalibrateReady(input: CalibrateReadyInput): boolean {
  if (!input.assessmentOk) return false
  const live = input.detectGeneration
  const applied = input.appliedGeneration ?? 0

  if (input.detectPhase === 'running' || input.detectPhase === 'review') {
    return false
  }
  if (input.detectPhase === 'applied') {
    return live > 0 && applied === live
  }
  if (input.detectPhase === 'failed' || input.detectPhase === 'manual') {
    if (live > 0) return applied === live
    return true
  }
  return true
}

export type CalibrateReadyFit = {
  calibration: {
    assessment: { ok: boolean }
    data: { imageGeneration?: number | null }
    detect: Pick<DetectSession, 'phase' | 'imageGeneration'>
  }
}

/** Same derivation FlowProvider mounts — keep tests and UI on one gate. */
export function flowCalibrateReady(fit: CalibrateReadyFit): boolean {
  return isCalibrateReady({
    assessmentOk: fit.calibration.assessment.ok,
    appliedGeneration: fit.calibration.data.imageGeneration,
    detectPhase: fit.calibration.detect.phase,
    detectGeneration: fit.calibration.detect.imageGeneration,
  })
}
