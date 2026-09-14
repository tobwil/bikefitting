import { CAPTURE_ASSET_KIND, CAPTURE_SCHEMA_VERSION, type CaptureAsset } from '../types/capture.ts'
import { createMemoryCaptureStore } from '../capture/storage.ts'
import { ANALYSIS_LATENCY_TARGET, LIVE_METRICS_MAX_FRAMES } from './constants.ts'
import { EVALUATING_LABEL, RETRY_ANALYSIS_LABEL } from './copy.ts'
import { createInjectedDecoder } from './decoder.ts'
import { createAnalysisController, retryKeepsBytes } from './controller.ts'
import { shouldAutoStartAnalysis, keepClipOnAnalysisFailure } from './autoStart.ts'
import { canTransitionAnalysis, progressRatio, transitionAnalysis } from './job.ts'
import type { AnalysisMetricsAdapter } from './metricsAdapter.ts'
import { MARKERLESS_AP05_ADAPTER, PENDING_AP05_ADAPTER } from './metricsAdapter.ts'
import { MARKERLESS_MIN_VALID_CYCLES } from './constants.ts'
import { buildMarkerlessFixtureClip } from './fixture.ts'
import { decideAction, beginnerSeatAction } from '../action/decide.ts'
import { actionInputFromMarkerless } from './quality.ts'
import { MARKERLESS_KNEE_METHOD, MARKERLESS_KNEE_METHOD_VERSION } from '../types/analysis.ts'
import { planSampleTimesMs, plannedFramesExceedLiveCap } from './plan.ts'
import { createFailingPoseSource, createTimelinePoseSource, HARNESS_CLIP_DURATION_MS, poseForTimeline } from './poseInjected.ts'
import { runAnalysisJob } from './run.ts'
import { selectPedalingSegment } from './segment.ts'
import { createQueuedJob } from './job.ts'
import type { AnalysisJob, AnalysisMetricsRequest, AnalysisPoseSample } from '../types/analysis.ts'

export type AnalysisHarnessCase = { name: string; passed: boolean; detail: string }
export type AnalysisHarnessResult = { passed: boolean; cases: AnalysisHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): AnalysisHarnessCase {
  return { name, passed, detail }
}

function sampleAsset(over: Partial<CaptureAsset> = {}): CaptureAsset {
  return {
    kind: CAPTURE_ASSET_KIND,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId: 'cap-analysis',
    blobKey: 'cap-analysis',
    contentHash: 'hash-bytes-1',
    mimeType: 'video/webm',
    codec: 'vp8',
    durationMs: HARNESS_CLIP_DURATION_MS,
    width: 1280,
    height: 720,
    rotationDeg: 0,
    captureType: 'continuity',
    completeness: 'complete',
    intendedDurationMs: 40_000,
    createdAt: '2026-09-14T12:00:00.000Z',
    hasAudio: false,
    byteLength: 64,
    filename: 'bikefit-cap-analysis.webm',
    ...over,
  }
}

function samplesFromTimeline(durationMs: number, fps: number): AnalysisPoseSample[] {
  const times = planSampleTimesMs(durationMs, fps)
  return times.map((mediaTimeMs, index) => {
    const pose = poseForTimeline(mediaTimeMs)
    return {
      mediaTimeMs,
      inferenceTimestampMs: index + 1,
      pose,
      side: pose.nearSide ?? null,
    }
  })
}

async function waitFor(
  read: () => AnalysisJob | null,
  ok: (job: AnalysisJob) => boolean,
  timeoutMs = 4000,
): Promise<AnalysisJob | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = read()
    if (job && ok(job)) return job
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return read()
}

export function runAnalysisHarness(): AnalysisHarnessResult {
  const cases: AnalysisHarnessCase[] = []

  cases.push(
    check(
      'queued can run through decoding/pose/segment/measure to done and fail/cancel',
      transitionAnalysis('queued', 'decoding') === 'decoding' &&
        transitionAnalysis('decoding', 'pose') === 'pose' &&
        transitionAnalysis('pose', 'selecting_segment') === 'selecting_segment' &&
        transitionAnalysis('selecting_segment', 'measuring') === 'measuring' &&
        transitionAnalysis('measuring', 'done') === 'done' &&
        transitionAnalysis('queued', 'failed') === 'failed' &&
        transitionAnalysis('pose', 'failed') === 'failed' &&
        transitionAnalysis('done', 'queued') === 'done' &&
        canTransitionAnalysis('failed', 'queued') === false,
      'queued→…→done; retry is a new job',
    ),
  )

  cases.push(
    check(
      'progress is posed/planned frames, not a 60s latency budget',
      progressRatio({ phase: 'pose', plannedFrames: 100, decodedFrames: 50, posedFrames: 50 }) === 0.5 &&
        progressRatio({ phase: 'decoding', plannedFrames: 100, decodedFrames: 20, posedFrames: 0 }) === 0.2 &&
        progressRatio({ phase: 'queued', plannedFrames: 100, decodedFrames: 0, posedFrames: 0 }) === 0 &&
        progressRatio({ phase: 'done', plannedFrames: 100, decodedFrames: 100, posedFrames: 100 }) === 1 &&
        ANALYSIS_LATENCY_TARGET.medianMs === 60_000 &&
        ANALYSIS_LATENCY_TARGET.hardware.includes('not measured'),
      '0.5 at 50/100',
    ),
  )

  const planned40 = planSampleTimesMs(40_000, 30)
  cases.push(
    check(
      '40s/30fps is fully planned and not clipped to live metrics maxFrames 900',
      planned40.length > LIVE_METRICS_MAX_FRAMES &&
        plannedFramesExceedLiveCap(40_000, 30) &&
        planned40[0] === 0 &&
        planned40[planned40.length - 1] === 40_000,
      `${planned40.length} planned vs cap ${LIVE_METRICS_MAX_FRAMES}`,
    ),
  )

  cases.push(
    check(
      'beginner auto-starts after complete save; incomplete and existing job do not',
      shouldAutoStartAnalysis({ capturePhase: 'saved', completeness: 'complete', jobPhase: null }) &&
        !shouldAutoStartAnalysis({ capturePhase: 'saved', completeness: 'incomplete', jobPhase: null }) &&
        !shouldAutoStartAnalysis({ capturePhase: 'recording', completeness: 'complete', jobPhase: null }) &&
        !shouldAutoStartAnalysis({ capturePhase: 'saved', completeness: 'complete', jobPhase: 'queued' }) &&
        EVALUATING_LABEL === 'Aufnahme wird ausgewertet' &&
        RETRY_ANALYSIS_LABEL === 'Analyse erneut versuchen',
      'no extra Analysieren click',
    ),
  )

  cases.push(
    check(
      'analysis failure keeps the saved clip instead of an empty camera',
      keepClipOnAnalysisFailure({ capturePhase: 'saved', hasAsset: true, jobPhase: 'failed' }) &&
        !keepClipOnAnalysisFailure({ capturePhase: 'idle', hasAsset: false, jobPhase: 'failed' }),
      'saved+asset+failed',
    ),
  )

  const timelineSamples = samplesFromTimeline(HARNESS_CLIP_DURATION_MS, 10)
  const segmented = selectPedalingSegment(timelineSamples, 0.75)
  const excludedReasons = new Set(segmented.excluded.map((span) => span.reason))
  cases.push(
    check(
      'auto-separates stillstand/mount/dismount from a contiguous pedaling span',
      segmented.selected != null &&
        segmented.selected.startMs >= 1500 &&
        segmented.selected.endMs <= 7000 &&
        segmented.selected.endMs - segmented.selected.startMs >= 2500 &&
        excludedReasons.has('stillstand') &&
        excludedReasons.has('mount') &&
        excludedReasons.has('dismount') &&
        !segmented.labels.some((label, index) => {
          const t = timelineSamples[index]?.mediaTimeMs ?? 0
          return label === 'pedaling' && (t < 1000 || t > 7300)
        }),
      segmented.selected
        ? `${segmented.selected.startMs}-${segmented.selected.endMs} excluded=${[...excludedReasons].join(',')}`
        : 'no segment',
    ),
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `ANALYSIS_HARNESS_OK — ${cases.length} sync checks.`
        : `ANALYSIS_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}

export async function runAnalysisHarnessAsync(): Promise<AnalysisHarnessResult> {
  const prefix = runAnalysisHarness()
  const cases = [...prefix.cases]

  const store = createMemoryCaptureStore()
  const asset = sampleAsset()
  const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 8])], { type: 'video/webm' })
  await store.put(asset, blob)

  let clock = 1_000
  const now = () => {
    clock += 60_000
    return clock
  }

  const capturedRequests: AnalysisMetricsRequest[] = []
  const metrics: AnalysisMetricsAdapter = {
    id: 'harness.metrics',
    version: 'test',
    async measure(request: AnalysisMetricsRequest) {
      capturedRequests.push(request)
      return {
        adapterId: this.id,
        adapterVersion: this.version,
        status: 'unavailable',
        observation: null,
        usableCycles: 0,
        reasons: ['harness'],
      }
    },
  }

  const phases: string[] = []
  const controller = createAnalysisController({
    store,
    pose: createTimelinePoseSource(),
    metrics,
    now,
    createDecoder: async (_blob, durationMs) => createInjectedDecoder({ durationMs }),
    options: { targetFps: 10, decoderKind: 'injected', frameAccurate: false },
  })
  controller.subscribe((job) => {
    if (job && phases[phases.length - 1] !== job.phase) phases.push(job.phase)
  })

  await controller.enqueueSaved(asset, blob)
  const done = await waitFor(() => controller.snapshot(), (job) => job.phase === 'done' || job.phase === 'failed')
  const path = phases.join('→')
  cases.push(
    check(
      'job lifecycle queued→running→done on saved bytes',
      Boolean(
        done &&
          done.phase === 'done' &&
          done.captureId === asset.captureId &&
          done.inputHash === asset.contentHash &&
          path.includes('queued') &&
          path.includes('decoding') &&
          path.includes('pose') &&
          path.includes('selecting_segment') &&
          path.includes('measuring') &&
          path.includes('done'),
      ),
      done ? `${path} frames=${done.progress.posedFrames}/${done.progress.plannedFrames}` : 'no job',
    ),
  )

  cases.push(
    check(
      'progress stayed frame-based while the clock jumped 60s per tick',
      Boolean(
        done &&
          done.phase === 'done' &&
          done.progress.ratio === 1 &&
          done.progress.plannedFrames > 0 &&
          done.progress.posedFrames === done.progress.plannedFrames &&
          (done.elapsedMs ?? 0) >= 60_000,
      ),
      done ? `ratio=${done.progress.ratio} elapsedMs=${done.elapsedMs}` : 'missing',
    ),
  )

  const request = capturedRequests[0]
  const span = request?.selected
  const selectedOk =
    request != null &&
    span != null &&
    request.captureId === asset.captureId &&
    request.inputHash === asset.contentHash &&
    request.jobId === done?.jobId &&
    request.samples.every(
      (sample) => sample.mediaTimeMs >= span.startMs && sample.mediaTimeMs <= span.endMs,
    )
  cases.push(
    check(
      'AP-05 adapter receives selected-segment samples and no ActionDecision adjust',
      Boolean(
        selectedOk &&
          done?.metrics?.observation == null &&
          !JSON.stringify(done?.metrics).includes('"kind":"adjust"'),
      ),
      request ? `samples=${request.samples.length} adapter=${done?.metrics?.adapterId}` : 'adapter not called',
    ),
  )

  const pending = await PENDING_AP05_ADAPTER.measure({
    jobId: 'job-x',
    captureId: asset.captureId,
    inputHash: asset.contentHash,
    pipelineVersion: 'ap03.l2.v1',
    model: 'lite',
    modelHash: null,
    wasmHash: null,
    geometryRevision: 0,
    selected: done?.selected ?? null,
    excluded: done?.excluded ?? [],
    samples: [],
    options: done?.options ?? {
      pipelineVersion: 'ap03.l2.v1',
      targetFps: 10,
      model: 'lite',
      minVisibility: 0.75,
      decoderKind: 'injected',
      frameAccurate: false,
    },
  })
  cases.push(
    check(
      'default AP-05 adapter is not_implemented without inventing knee numbers or seat adjust',
      pending.status === 'not_implemented' && pending.observation === null && pending.reasons.includes('ap05_not_wired'),
      pending.status,
    ),
  )

  const failStore = createMemoryCaptureStore()
  const failAsset = sampleAsset({ captureId: 'cap-fail', blobKey: 'cap-fail', contentHash: 'hash-bytes-1' })
  await failStore.put(failAsset, blob)
  let failOnce = true
  const timeline = createTimelinePoseSource()
  const failThenOk = {
    async detect(
      frame: Parameters<typeof timeline.detect>[0],
      ts: number,
      token: Parameters<typeof timeline.detect>[2],
    ) {
      if (failOnce) {
        failOnce = false
        return { status: 'error' as const, message: 'injected' }
      }
      return timeline.detect(frame, ts, token)
    },
  }
  const failController = createAnalysisController({
    store: failStore,
    pose: failThenOk,
    createDecoder: async (_blob, durationMs) => createInjectedDecoder({ durationMs }),
    options: { targetFps: 10, decoderKind: 'injected', frameAccurate: false },
  })
  await failController.enqueueSaved(failAsset, blob)
  const failed = await waitFor(() => failController.snapshot(), (job) => job.phase === 'failed')
  const afterFail = failController.snapshot()
  const retried = await failController.retrySameBytes()
  const recovered = await waitFor(() => failController.snapshot(), (job) => job.phase === 'done' || job.phase === 'failed')
  cases.push(
    check(
      'fail then retry uses a new jobId on the same capture bytes',
      Boolean(
        failed &&
          failed.phase === 'failed' &&
          afterFail?.captureId === failAsset.captureId &&
          retried &&
          recovered &&
          recovered.phase === 'done' &&
          retryKeepsBytes(failed, recovered) &&
          recovered.inputHash === failAsset.contentHash,
      ),
      failed && recovered
        ? `${failed.jobId} → ${recovered.jobId} hash=${recovered.inputHash}`
        : `fail=${failed?.phase} retry=${recovered?.phase}`,
    ),
  )

  const storedAfter = await failStore.get(failAsset.captureId)
  cases.push(
    check(
      'retry does not drop the clip from the capture store',
      storedAfter?.asset.contentHash === failAsset.contentHash && storedAfter.blob.size === blob.size,
      storedAfter ? `bytes=${storedAfter.blob.size}` : 'missing',
    ),
  )

  let staleWrites = 0
  let generation = 1
  const seed = createQueuedJob({
    captureId: 'cap-stale',
    inputHash: 'hash-bytes-1',
    generation: 1,
    options: { decoderKind: 'injected', targetFps: 10, frameAccurate: false },
  })
  const staleRun = runAnalysisJob(
    seed,
    {
      decoder: createInjectedDecoder({ durationMs: 400 }),
      pose: {
        async detect() {
          await new Promise((resolve) => setTimeout(resolve, 30))
          return { status: 'error', message: 'late-fail' }
        },
      },
      now: () => 1,
    },
    { jobId: seed.jobId, generation: 1, isCurrent: () => generation === 1 },
    {
      onUpdate: () => {
        staleWrites += 1
      },
    },
  )
  generation = 2
  const staleResult = await staleRun
  cases.push(
    check(
      'stale jobId/generation replies do not keep writing after a newer generation',
      generation === 2 && staleWrites <= 2,
      `writes=${staleWrites} result=${staleResult.phase}`,
    ),
  )

  const stuck = await runAnalysisJob(
    createQueuedJob({
      captureId: 'cap-dup',
      inputHash: 'hash-bytes-1',
      generation: 1,
      options: { decoderKind: 'injected', targetFps: 10, frameAccurate: false },
    }),
    {
      decoder: createInjectedDecoder({ durationMs: 1000, actualTimeMs: () => 0 }),
      pose: createFailingPoseSource(99),
      now: () => 1,
    },
    { jobId: 'job-dup', generation: 1, isCurrent: () => true },
    { onUpdate: () => undefined },
  )
  cases.push(
    check(
      'duplicate seek timestamps are dropped and do not invent frames',
      stuck.phase === 'failed' &&
        stuck.error?.code === 'decode_stuck' &&
        stuck.progress.duplicateSeeksDropped >= 1 &&
        stuck.options.frameAccurate === false,
      `${stuck.phase} dup=${stuck.progress.duplicateSeeksDropped}`,
    ),
  )

  const incomplete = sampleAsset({ completeness: 'incomplete', captureId: 'cap-short' })
  const skip = createAnalysisController({
    store: createMemoryCaptureStore(),
    pose: createTimelinePoseSource(),
    createDecoder: async (_blob, durationMs) => createInjectedDecoder({ durationMs }),
  })
  const skipped = await skip.enqueueSaved(incomplete, blob)
  cases.push(
    check(
      'incomplete clips are not auto-enqueued',
      skipped == null,
      skipped ? skipped.phase : 'null',
    ),
  )

  const happy = buildMarkerlessFixtureClip({ revs: 13 })
  const wiredSamples: AnalysisPoseSample[] = happy.frames.map((pose, index) => ({
    mediaTimeMs: pose.timestampMs,
    inferenceTimestampMs: index + 1,
    pose,
    side: pose.nearSide ?? null,
  }))
  const wired = await MARKERLESS_AP05_ADAPTER.measure({
    jobId: 'job-wired',
    captureId: happy.captureId,
    inputHash: 'hash-wired',
    pipelineVersion: 'ap03.l2.v1',
    model: 'lite',
    modelHash: null,
    wasmHash: null,
    geometryRevision: 0,
    selected: {
      startMs: wiredSamples[0]!.mediaTimeMs,
      endMs: wiredSamples[wiredSamples.length - 1]!.mediaTimeMs,
      side: wiredSamples[0]!.side,
      sampleCount: wiredSamples.length,
    },
    excluded: [],
    samples: wiredSamples,
    options: {
      pipelineVersion: 'ap03.l2.v1',
      targetFps: 30,
      model: 'lite',
      minVisibility: 0.75,
      decoderKind: 'injected',
      frameAccurate: false,
    },
  })
  const wiredReport = wired.observation
  const wiredAction =
    wiredReport != null
      ? decideAction(
          actionInputFromMarkerless(wiredReport, {
            captureId: happy.captureId,
            analysisId: 'job-wired',
          }),
        )
      : null
  const wiredBlob = JSON.stringify(wired)
  cases.push(
    check(
      'wired AP-05 adapter produces max_extension report not BDC or seat adjust',
      wired.status === 'ok' &&
        wired.adapterId === 'ap05.markerless' &&
        wired.observation?.method === MARKERLESS_KNEE_METHOD &&
        wired.observation.methodVersion === MARKERLESS_KNEE_METHOD_VERSION &&
        (wired.usableCycles ?? 0) >= MARKERLESS_MIN_VALID_CYCLES &&
        wiredAction?.kind === 'review' &&
        wiredAction.blockReasons.includes('markerless_not_released') &&
        wiredAction.parameter == null &&
        !beginnerSeatAction(wiredAction) &&
        !wiredBlob.includes('"kind":"adjust"') &&
        !/bottom_dead_center/.test(wiredBlob),
      `status=${wired.status} method=${wired.observation?.method} n=${wired.usableCycles} kind=${wiredAction?.kind}`,
    ),
  )

  const failedCases = cases.filter((item) => !item.passed)
  return {
    passed: failedCases.length === 0,
    cases,
    message:
      failedCases.length === 0
        ? `ANALYSIS_HARNESS_OK — ${cases.length} checks.`
        : `ANALYSIS_HARNESS_FAIL — ${failedCases.map((item) => item.name).join(', ')}`,
  }
}
