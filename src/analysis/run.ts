import type { PoseDetectResult } from '../types/pose-engine.ts'
import type { AnalysisJob, AnalysisPoseSample } from '../types/analysis.ts'
import { nextPoseInferenceTimestampMs } from '../pose/createPoseEngine.ts'
import { inferNearSide } from '../pose/nearSide.ts'
import { ANALYSIS_ERROR_COPY } from './copy.ts'
import type { MediaDecoder } from './decoder.ts'
import { transitionAnalysis, withProgress } from './job.ts'
import type { AnalysisMetricsAdapter } from './metricsAdapter.ts'
import { MARKERLESS_AP05_ADAPTER } from './metricsAdapter.ts'
import { planSampleTimesMs } from './plan.ts'
import { samplesInSegment, selectPedalingSegment } from './segment.ts'

export type JobToken = {
  jobId: string
  generation: number
  isCurrent: () => boolean
}

export type PoseSource = {
  prepare?: () => Promise<void>
  detect: (
    frame: { mediaTimeMs: number; bitmap: ImageBitmap | null; width: number; height: number },
    inferenceTimestampMs: number,
    token: JobToken,
  ) => Promise<PoseDetectResult>
  close?: () => Promise<void>
}

export type AnalysisRuntime = {
  decoder: MediaDecoder
  pose: PoseSource
  metrics?: AnalysisMetricsAdapter
  now?: () => number
}

export type AnalysisRunHooks = {
  onUpdate: (job: AnalysisJob) => void
}

function cloneJob(job: AnalysisJob): AnalysisJob {
  return {
    ...job,
    progress: { ...job.progress },
    excluded: [...job.excluded],
    options: { ...job.options },
    error: job.error ? { ...job.error } : null,
    selected: job.selected ? { ...job.selected } : null,
    metrics: job.metrics ? { ...job.metrics, reasons: [...job.metrics.reasons] } : null,
  }
}

export async function runAnalysisJob(
  seed: AnalysisJob,
  runtime: AnalysisRuntime,
  token: JobToken,
  hooks: AnalysisRunHooks,
): Promise<AnalysisJob> {
  const now = runtime.now ?? (() => Date.now())
  const metrics = runtime.metrics ?? MARKERLESS_AP05_ADAPTER
  let job = cloneJob(seed)
  const emit = (next: AnalysisJob) => {
    if (!token.isCurrent()) return
    job = cloneJob(next)
    job.progress = withProgress(job.progress, job.phase)
    if (job.startedAtMs != null) job.elapsedMs = now() - job.startedAtMs
    hooks.onUpdate(cloneJob(job))
  }

  const fail = (code: 'decode' | 'decode_stuck' | 'pose' | 'unknown') => {
    if (!token.isCurrent()) return cloneJob(job)
    job.phase = 'failed'
    job.error = { code, message: ANALYSIS_ERROR_COPY[code] }
    job.finishedAtMs = now()
    job.elapsedMs = job.startedAtMs != null ? job.finishedAtMs - job.startedAtMs : null
    job.progress = withProgress(job.progress, job.phase)
    emit(job)
    return cloneJob(job)
  }

  if (!token.isCurrent()) return cloneJob(job)

  job.startedAtMs = now()
  job.phase = transitionAnalysis(job.phase, 'decoding')
  emit(job)

  try {
    await runtime.pose.prepare?.()
  } catch {
    return fail('pose')
  }
  if (!token.isCurrent()) return cloneJob(job)

  const planned = planSampleTimesMs(runtime.decoder.durationMs, job.options.targetFps)
  job.progress.plannedFrames = planned.length
  emit(job)

  if (planned.length === 0) return fail('decode')

  const samples: AnalysisPoseSample[] = []
  let lastInference = -1
  let posedPhase = false

  for (const plannedTime of planned) {
    if (!token.isCurrent()) return cloneJob(job)
    let frame
    try {
      frame = await runtime.decoder.read(plannedTime)
    } catch {
      return fail('decode')
    }
    try {
      if (frame.duplicate) {
        job.progress.duplicateSeeksDropped += 1
        emit(job)
        continue
      }
      job.progress.decodedFrames += 1
      job.progress.uniqueMediaTimesMs += 1
      emit(job)

      if (!posedPhase) {
        job.phase = transitionAnalysis(job.phase, 'pose')
        posedPhase = true
        emit(job)
      }

      const inferenceTimestampMs = nextPoseInferenceTimestampMs(frame.mediaTimeMs, lastInference)
      lastInference = inferenceTimestampMs
      let detected: PoseDetectResult
      try {
        detected = await runtime.pose.detect(
          {
            mediaTimeMs: frame.mediaTimeMs,
            bitmap: frame.bitmap,
            width: frame.width,
            height: frame.height,
          },
          inferenceTimestampMs,
          token,
        )
      } catch {
        return fail('pose')
      }
      if (!token.isCurrent()) return cloneJob(job)
      if (detected.status === 'dropped') {
        job.progress.posedFrames += 1
        emit(job)
        continue
      }
      if (detected.status === 'error') return fail('pose')
      const pose = detected.status === 'frame' ? detected.frame : null
      const side =
        pose?.nearSide ??
        (pose ? inferNearSide(pose.landmarks, job.options.minVisibility) ?? null : null)
      samples.push({
        mediaTimeMs: frame.mediaTimeMs,
        inferenceTimestampMs,
        pose,
        side,
      })
      job.progress.posedFrames += 1
      emit(job)
    } finally {
      frame.release()
    }
  }

  if (!token.isCurrent()) return cloneJob(job)
  if (job.progress.uniqueMediaTimesMs < 2) return fail('decode_stuck')

  job.phase = transitionAnalysis(job.phase, 'selecting_segment')
  emit(job)
  const segmented = selectPedalingSegment(samples, job.options.minVisibility)
  job.selected = segmented.selected
  job.excluded = segmented.excluded
  emit(job)

  if (!token.isCurrent()) return cloneJob(job)
  job.phase = transitionAnalysis(job.phase, 'measuring')
  emit(job)

  const selectedSamples = samplesInSegment(samples, job.selected)
  try {
    job.metrics = await metrics.measure({
      jobId: job.jobId,
      captureId: job.captureId,
      inputHash: job.inputHash,
      pipelineVersion: job.pipelineVersion,
      model: job.options.model,
      modelHash: job.modelHash,
      wasmHash: job.wasmHash,
      geometryRevision: job.geometryRevision,
      selected: job.selected,
      excluded: job.excluded,
      samples: selectedSamples,
      options: job.options,
    })
  } catch {
    return fail('unknown')
  }
  if (!token.isCurrent()) return cloneJob(job)

  job.phase = transitionAnalysis(job.phase, 'done')
  job.finishedAtMs = now()
  job.elapsedMs = job.startedAtMs != null ? job.finishedAtMs - job.startedAtMs : null
  job.progress = withProgress(job.progress, job.phase)
  emit(job)
  return cloneJob(job)
}

