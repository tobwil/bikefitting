import {
  ANALYSIS_JOB_KIND,
  ANALYSIS_PIPELINE_VERSION,
  ANALYSIS_SCHEMA_VERSION,
  type AnalysisJob,
  type AnalysisJobOptions,
  type AnalysisPhase,
  type AnalysisProgress,
} from '../types/analysis.ts'
import { DEFAULT_ANALYSIS_OPTIONS } from './constants.ts'

const ALLOWED: Record<AnalysisPhase, ReadonlySet<AnalysisPhase>> = {
  queued: new Set(['decoding', 'cancelled', 'failed']),
  decoding: new Set(['pose', 'failed', 'cancelled']),
  pose: new Set(['selecting_segment', 'failed', 'cancelled']),
  selecting_segment: new Set(['measuring', 'failed', 'cancelled']),
  measuring: new Set(['done', 'failed', 'cancelled']),
  done: new Set(),
  cancelled: new Set(),
  failed: new Set(),
}

export function canTransitionAnalysis(from: AnalysisPhase, to: AnalysisPhase): boolean {
  if (from === to) return true
  return ALLOWED[from].has(to)
}

export function transitionAnalysis(from: AnalysisPhase, to: AnalysisPhase): AnalysisPhase {
  if (from === to) return from
  if (!canTransitionAnalysis(from, to)) return from
  return to
}

export function emptyProgress(): AnalysisProgress {
  return {
    plannedFrames: 0,
    decodedFrames: 0,
    posedFrames: 0,
    uniqueMediaTimesMs: 0,
    duplicateSeeksDropped: 0,
    ratio: 0,
  }
}

/** Frame work only. Never elapsed/target-latency. */
export function progressRatio(input: {
  phase: AnalysisPhase
  plannedFrames: number
  decodedFrames: number
  posedFrames: number
}): number {
  if (input.phase === 'queued') return 0
  if (input.phase === 'done') return 1
  const planned = input.plannedFrames
  if (!Number.isFinite(planned) || planned <= 0) return 0
  if (input.phase === 'decoding') {
    return Math.min(1, Math.max(0, input.decodedFrames / planned))
  }
  return Math.min(1, Math.max(0, input.posedFrames / planned))
}

export function withProgress(progress: AnalysisProgress, phase: AnalysisPhase): AnalysisProgress {
  return {
    ...progress,
    ratio: progressRatio({
      phase,
      plannedFrames: progress.plannedFrames,
      decodedFrames: progress.decodedFrames,
      posedFrames: progress.posedFrames,
    }),
  }
}

export function optionsFingerprint(options: AnalysisJobOptions): string {
  return [
    options.pipelineVersion,
    options.model,
    options.targetFps,
    options.minVisibility,
    options.decoderKind,
    options.frameAccurate ? 'fa' : 'seek',
  ].join('|')
}

export function sameAnalysisConfig(a: AnalysisJob, b: Pick<AnalysisJob, 'captureId' | 'inputHash' | 'options'>): boolean {
  return (
    a.captureId === b.captureId &&
    a.inputHash === b.inputHash &&
    optionsFingerprint(a.options) === optionsFingerprint(b.options)
  )
}

export function newAnalysisJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `job-${crypto.randomUUID()}`
  }
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createQueuedJob(input: {
  captureId: string
  inputHash: string
  jobId?: string
  generation?: number
  options?: Partial<AnalysisJobOptions>
  geometryRevision?: number
  modelHash?: string | null
  wasmHash?: string | null
}): AnalysisJob {
  const options: AnalysisJobOptions = {
    ...DEFAULT_ANALYSIS_OPTIONS,
    ...input.options,
    frameAccurate: false,
  }
  return {
    kind: ANALYSIS_JOB_KIND,
    schemaVersion: ANALYSIS_SCHEMA_VERSION,
    jobId: input.jobId ?? newAnalysisJobId(),
    generation: input.generation ?? 1,
    captureId: input.captureId,
    inputHash: input.inputHash,
    pipelineVersion: options.pipelineVersion || ANALYSIS_PIPELINE_VERSION,
    modelHash: input.modelHash ?? null,
    wasmHash: input.wasmHash ?? null,
    geometryRevision: input.geometryRevision ?? 0,
    options,
    phase: 'queued',
    progress: emptyProgress(),
    error: null,
    selected: null,
    excluded: [],
    metrics: null,
    startedAtMs: null,
    finishedAtMs: null,
    elapsedMs: null,
  }
}

export function jobConfigKey(job: Pick<AnalysisJob, 'captureId' | 'inputHash' | 'options'>): string {
  return `${job.captureId}:${job.inputHash}:${optionsFingerprint(job.options)}`
}
