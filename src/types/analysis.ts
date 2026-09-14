/** Offline analysis job contract (AP-03 L2). Independent of live rVFC preview. */

import type { CameraNearSide, PoseFrame } from './landmarks.ts'

export const ANALYSIS_JOB_KIND = 'bikefit.analysis-job' as const
export const ANALYSIS_SCHEMA_VERSION = 1 as const
export const ANALYSIS_PIPELINE_VERSION = 'ap03.l2.v1' as const

/**
 * Decode → pose → segment → measure. `done` / `failed` / `cancelled` are terminal.
 * Progress must come from processed media frames, not a time budget.
 */
export const ANALYSIS_PHASES = [
  'queued',
  'decoding',
  'pose',
  'selecting_segment',
  'measuring',
  'done',
  'cancelled',
  'failed',
] as const

export type AnalysisPhase = (typeof ANALYSIS_PHASES)[number]

export const ANALYSIS_RUNNING_PHASES = [
  'queued',
  'decoding',
  'pose',
  'selecting_segment',
  'measuring',
] as const

export type AnalysisRunningPhase = (typeof ANALYSIS_RUNNING_PHASES)[number]

export const ANALYSIS_DECODER_KINDS = ['html_video_seek', 'injected'] as const
export type AnalysisDecoderKind = (typeof ANALYSIS_DECODER_KINDS)[number]

export const ANALYSIS_EXCLUDE_REASONS = [
  'mount',
  'dismount',
  'stillstand',
  'insufficient_pose',
  'camera_motion',
  'side_switch',
  'unsteady',
] as const
export type AnalysisExcludeReason = (typeof ANALYSIS_EXCLUDE_REASONS)[number]

export const ANALYSIS_ERROR_CODES = [
  'decode',
  'decode_stuck',
  'pose',
  'cancelled',
  'store_missing',
  'hash_mismatch',
  'unknown',
] as const
export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number]

export type AnalysisError = {
  code: AnalysisErrorCode
  message: string
}

export type AnalysisJobOptions = {
  pipelineVersion: string
  targetFps: number
  model: 'lite' | 'full'
  minVisibility: number
  decoderKind: AnalysisDecoderKind
  /** Seek fallback must stay false. Do not claim frame-accurate delivery. */
  frameAccurate: false
}

export type AnalysisProgress = {
  plannedFrames: number
  decodedFrames: number
  posedFrames: number
  uniqueMediaTimesMs: number
  duplicateSeeksDropped: number
  /** 0..1 from work done (frames), never elapsed/budget. */
  ratio: number
}

export type AnalysisExcludedSpan = {
  startMs: number
  endMs: number
  reason: AnalysisExcludeReason
}

export type AnalysisSelectedSegment = {
  startMs: number
  endMs: number
  side: CameraNearSide | null
  sampleCount: number
}

export type AnalysisPoseSample = {
  mediaTimeMs: number
  inferenceTimestampMs: number
  pose: PoseFrame | null
  side: CameraNearSide | null
}

/**
 * Job → AP-05 metrics. AP-03 owns decode/pose/segment; AP-05 owns markerless numbers.
 * Merge point: implement `AnalysisMetricsAdapter` and pass it into the controller.
 */
export type AnalysisMetricsRequest = {
  jobId: string
  captureId: string
  inputHash: string
  pipelineVersion: string
  model: 'lite' | 'full'
  modelHash: string | null
  wasmHash: string | null
  geometryRevision: number
  selected: AnalysisSelectedSegment | null
  excluded: readonly AnalysisExcludedSpan[]
  /** Compact samples inside the selected span only (empty if none). */
  samples: readonly AnalysisPoseSample[]
  options: AnalysisJobOptions
}

export type AnalysisMetricsStatus = 'ok' | 'unavailable' | 'not_implemented'

export type AnalysisMetricsResponse = {
  adapterId: string
  adapterVersion: string
  status: AnalysisMetricsStatus
  /** AP-05 fills a versioned observation. AP-03 default leaves this null. */
  observation: unknown | null
  usableCycles: number | null
  reasons: string[]
}

export type AnalysisJob = {
  kind: typeof ANALYSIS_JOB_KIND
  schemaVersion: typeof ANALYSIS_SCHEMA_VERSION
  jobId: string
  generation: number
  captureId: string
  inputHash: string
  pipelineVersion: string
  modelHash: string | null
  wasmHash: string | null
  geometryRevision: number
  options: AnalysisJobOptions
  phase: AnalysisPhase
  progress: AnalysisProgress
  error: AnalysisError | null
  selected: AnalysisSelectedSegment | null
  excluded: AnalysisExcludedSpan[]
  metrics: AnalysisMetricsResponse | null
  startedAtMs: number | null
  finishedAtMs: number | null
  /** Wall time of this run. Instrumented only — not a published SLA. */
  elapsedMs: number | null
}

export function isAnalysisRunning(phase: AnalysisPhase): boolean {
  return (ANALYSIS_RUNNING_PHASES as readonly string[]).includes(phase)
}
