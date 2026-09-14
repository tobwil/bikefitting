import type { CaptureAsset } from '../types/capture.ts'
import {
  ANALYSIS_PIPELINE_VERSION,
  type AnalysisJob,
  type AnalysisJobOptions,
  isAnalysisRunning,
} from '../types/analysis.ts'
import type { CaptureStore } from '../capture/storage.ts'
import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { ANALYSIS_TARGET_FPS } from './constants.ts'
import { ANALYSIS_ERROR_COPY } from './copy.ts'
import { createHtmlVideoDecoder, createInjectedDecoder, type MediaDecoder } from './decoder.ts'
import { createQueuedJob, jobConfigKey, newAnalysisJobId, sameAnalysisConfig } from './job.ts'
import type { AnalysisMetricsAdapter } from './metricsAdapter.ts'
import { PENDING_AP05_ADAPTER } from './metricsAdapter.ts'
import { runAnalysisJob, type PoseSource } from './run.ts'

export type AnalysisController = {
  snapshot: () => AnalysisJob | null
  subscribe: (listener: (job: AnalysisJob | null) => void) => () => void
  enqueueSaved: (asset: CaptureAsset, blob: Blob) => Promise<AnalysisJob | null>
  retrySameBytes: () => Promise<AnalysisJob | null>
  cancel: () => void
  clear: () => void
}

export type AnalysisControllerDeps = {
  store: CaptureStore
  pose: PoseSource
  metrics?: AnalysisMetricsAdapter
  now?: () => number
  createDecoder?: (blob: Blob, durationMs: number) => Promise<MediaDecoder>
  options?: Partial<AnalysisJobOptions>
}

function defaultOptions(over: Partial<AnalysisJobOptions> | undefined): AnalysisJobOptions {
  return {
    pipelineVersion: over?.pipelineVersion ?? ANALYSIS_PIPELINE_VERSION,
    targetFps: over?.targetFps ?? ANALYSIS_TARGET_FPS,
    model: over?.model ?? 'lite',
    minVisibility: over?.minVisibility ?? MIN_LANDMARK_VISIBILITY,
    decoderKind: over?.decoderKind ?? (typeof document === 'undefined' ? 'injected' : 'html_video_seek'),
    frameAccurate: false,
  }
}

export function createAnalysisController(deps: AnalysisControllerDeps): AnalysisController {
  const now = deps.now ?? (() => Date.now())
  const metrics = deps.metrics ?? PENDING_AP05_ADAPTER
  const makeDecoder =
    deps.createDecoder ??
    (async (blob: Blob, durationMs: number) => {
      if (typeof document === 'undefined') return createInjectedDecoder({ durationMs })
      return createHtmlVideoDecoder(blob, durationMs)
    })

  let job: AnalysisJob | null = null
  let generation = 0
  let blobCache: Blob | null = null
  const listeners = new Set<(next: AnalysisJob | null) => void>()

  const emit = (next: AnalysisJob | null) => {
    job = next
    for (const listener of listeners) listener(next)
  }

  const isCurrent = (next: AnalysisJob) => job?.jobId === next.jobId && job.generation === next.generation

  const failNow = (seed: AnalysisJob, code: 'decode' | 'store_missing' | 'hash_mismatch'): AnalysisJob => {
    const failed: AnalysisJob = {
      ...seed,
      phase: 'failed',
      error: { code, message: ANALYSIS_ERROR_COPY[code] },
      finishedAtMs: now(),
      elapsedMs: 0,
    }
    emit(failed)
    return failed
  }

  const start = async (next: AnalysisJob, blob: Blob): Promise<AnalysisJob> => {
    blobCache = blob
    emit(next)
    const stored = await deps.store.get(next.captureId)
    const durationMs = stored?.asset.durationMs ?? 0
    if (!isCurrent(next)) return job ?? next
    let decoder: MediaDecoder
    try {
      decoder = await makeDecoder(blob, durationMs)
    } catch {
      return failNow(next, 'decode')
    }
    const seeded: AnalysisJob = {
      ...next,
      options: { ...next.options, decoderKind: decoder.kind, frameAccurate: false },
    }
    if (isCurrent(next)) emit(seeded)
    try {
      const finished = await runAnalysisJob(
        seeded,
        { decoder, pose: deps.pose, metrics, now },
        {
          jobId: seeded.jobId,
          generation: seeded.generation,
          isCurrent: () => isCurrent(seeded),
        },
        {
          onUpdate: (updated) => {
            if (isCurrent(seeded)) emit(updated)
          },
        },
      )
      if (isCurrent(seeded)) emit(finished)
      return job ?? finished
    } finally {
      decoder.close()
    }
  }

  return {
    snapshot: () => job,
    subscribe(listener) {
      listeners.add(listener)
      listener(job)
      return () => listeners.delete(listener)
    },
    async enqueueSaved(asset, blob) {
      if (asset.completeness !== 'complete') return job
      const options = defaultOptions(deps.options)
      const same = { captureId: asset.captureId, inputHash: asset.contentHash, options }
      if (job && isAnalysisRunning(job.phase) && sameAnalysisConfig(job, same)) return job
      if (job && job.phase === 'done' && sameAnalysisConfig(job, same)) return job
      generation += 1
      const next = createQueuedJob({
        captureId: asset.captureId,
        inputHash: asset.contentHash,
        generation,
        options,
      })
      await deps.store.put(asset, blob)
      return start(next, blob)
    },
    async retrySameBytes() {
      const previous = job
      if (!previous) return null
      const stored = await deps.store.get(previous.captureId)
      const blob = stored?.blob ?? blobCache
      const asset = stored?.asset
      generation += 1
      if (!asset || !blob) {
        return failNow(
          createQueuedJob({
            captureId: previous.captureId,
            inputHash: previous.inputHash,
            generation,
          }),
          'store_missing',
        )
      }
      if (asset.contentHash !== previous.inputHash) {
        return failNow(
          createQueuedJob({
            captureId: previous.captureId,
            inputHash: previous.inputHash,
            generation,
          }),
          'hash_mismatch',
        )
      }
      const next = createQueuedJob({
        captureId: asset.captureId,
        inputHash: asset.contentHash,
        generation,
        jobId: newAnalysisJobId(),
        options: previous.options,
        geometryRevision: previous.geometryRevision,
        modelHash: previous.modelHash,
        wasmHash: previous.wasmHash,
      })
      return start(next, blob)
    },
    cancel() {
      generation += 1
      if (job && isAnalysisRunning(job.phase)) {
        emit({
          ...job,
          generation,
          phase: 'cancelled',
          error: { code: 'cancelled', message: ANALYSIS_ERROR_COPY.cancelled },
          finishedAtMs: now(),
          elapsedMs: job.startedAtMs != null ? now() - job.startedAtMs : 0,
        })
      }
    },
    clear() {
      generation += 1
      blobCache = null
      emit(null)
    },
  }
}

export function retryKeepsBytes(previous: AnalysisJob, next: AnalysisJob): boolean {
  return (
    next.captureId === previous.captureId &&
    next.inputHash === previous.inputHash &&
    next.jobId !== previous.jobId &&
    jobConfigKey(previous) === jobConfigKey(next)
  )
}
