import type { CaptureCompleteness, CapturePhase } from '../types/capture.ts'
import type { AnalysisPhase } from '../types/analysis.ts'
import { isAnalysisRunning } from '../types/analysis.ts'

/** Beginner path: no extra „Analysieren“ click after a confirmed complete save. */
export function shouldAutoStartAnalysis(input: {
  capturePhase: CapturePhase
  completeness: CaptureCompleteness | null
  jobPhase: AnalysisPhase | null
}): boolean {
  if (input.capturePhase !== 'saved') return false
  if (input.completeness !== 'complete') return false
  if (input.jobPhase == null) return true
  return false
}

export function keepClipOnAnalysisFailure(input: {
  capturePhase: CapturePhase
  hasAsset: boolean
  jobPhase: AnalysisPhase | null
}): boolean {
  return input.capturePhase === 'saved' && input.hasAsset && input.jobPhase === 'failed'
}

export function retryIsPrimary(jobPhase: AnalysisPhase | null): boolean {
  return jobPhase === 'failed' || jobPhase === 'cancelled'
}

export function analysisBlocksNewCameraDump(jobPhase: AnalysisPhase | null): boolean {
  return jobPhase != null && (isAnalysisRunning(jobPhase) || jobPhase === 'failed' || jobPhase === 'done' || jobPhase === 'cancelled')
}
