import { createPoseEngine, nextPoseInferenceTimestampMs, type PoseEngineHandle } from './createPoseEngine.ts'
import {
  applyDetectToRuntimeFails,
  poseFreshness,
  poseHoldForSource,
  poseIsReady,
  poseReceiveTime,
  shouldMarkWorkerTimeout,
  POSE_DETECT_TIMEOUT_MS,
  POSE_LOST_MS,
  POSE_RUNTIME_FAIL_LIMIT,
  POSE_STALE_MS,
} from './freshness.ts'
import type { PoseWorkerRequest, PoseWorkerResponse } from '../types/pose-engine.ts'

export type PoseHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type PoseHarnessResult = {
  passed: boolean
  cases: PoseHarnessCase[]
  message: string
}

type DetectMode = 'frame' | 'miss' | 'hang' | 'error'

class FakeWorker {
  onmessage: ((event: MessageEvent<PoseWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readyDelayMs = 0
  detect: DetectMode = 'frame'
  posted: PoseWorkerRequest[] = []
  terminated = false
  private readonly listeners = new Set<(event: MessageEvent<PoseWorkerResponse>) => void>()

  addEventListener(type: string, fn: (event: MessageEvent<PoseWorkerResponse>) => void) {
    if (type === 'message') this.listeners.add(fn)
  }

  removeEventListener(_type: string, fn: (event: MessageEvent<PoseWorkerResponse>) => void) {
    this.listeners.delete(fn)
  }

  postMessage(msg: PoseWorkerRequest) {
    this.posted.push(msg)
    if (this.terminated) return
    if (msg.type === 'INIT') {
      setTimeout(() => this.emit({ type: 'READY', sessionId: msg.sessionId }), this.readyDelayMs)
      return
    }
    if (msg.type === 'DETECT_VIDEO') {
      if (this.detect === 'hang') return
      if (this.detect === 'miss') {
        this.emit({ type: 'MISS', timestampMs: msg.timestampMs, sessionId: msg.sessionId })
        return
      }
      if (this.detect === 'error') {
        this.emit({ type: 'ERROR', message: 'detect failed', sessionId: msg.sessionId })
        return
      }
      this.emit({
        type: 'FRAME',
        sessionId: msg.sessionId,
        frame: {
          timestampMs: msg.timestampMs,
          videoWidth: msg.videoWidth,
          videoHeight: msg.videoHeight,
          landmarks: [{ x: 0.4, y: 0.5, z: 0, visibility: 1 }],
          engine: 'mediapipe',
        },
      })
    }
  }

  terminate() {
    this.terminated = true
  }

  emit(data: PoseWorkerResponse) {
    if (this.terminated) return
    const event = { data } as MessageEvent<PoseWorkerResponse>
    this.onmessage?.(event)
    for (const fn of this.listeners) fn(event)
  }
}

function bitmap(): ImageBitmap {
  return {
    width: 8,
    height: 8,
    close() {},
  } as ImageBitmap
}

function detectPosts(worker: FakeWorker): Extract<PoseWorkerRequest, { type: 'DETECT_VIDEO' }>[] {
  return worker.posted.filter((msg): msg is Extract<PoseWorkerRequest, { type: 'DETECT_VIDEO' }> => msg.type === 'DETECT_VIDEO')
}

function engineWith(worker: FakeWorker): PoseEngineHandle {
  return createPoseEngine({ createWorker: () => worker as unknown as Worker })
}

export async function runPoseHarness(): Promise<PoseHarnessResult> {
  const cases: PoseHarnessCase[] = []

  const delayed = new FakeWorker()
  delayed.readyDelayMs = 40
  const delayedEngine = engineWith(delayed)
  const initPromise = delayedEngine.init()
  const initGenAtStart = delayedEngine.initGeneration()
  delayedEngine.bumpSession()
  await initPromise
  const afterBump = await delayedEngine.detectVideo(bitmap(), 11)
  const detects = detectPosts(delayed)
  cases.push({
    name: 'delayed INIT + camera bump still readies the same worker',
    passed:
      delayedEngine.isReady() &&
      delayedEngine.initGeneration() === initGenAtStart &&
      delayedEngine.sessionId() === 2 &&
      detects.length === 1 &&
      detects[0]?.sessionId === 2 &&
      afterBump.status === 'frame',
    detail: `ready=${delayedEngine.isReady()} initGen=${delayedEngine.initGeneration()} session=${delayedEngine.sessionId()} detects=${detects.length} firstDetectSession=${detects[0]?.sessionId ?? '—'} result=${afterBump.status}`,
  })
  await delayedEngine.dispose()

  const repeated = new FakeWorker()
  const repeatedEngine = engineWith(repeated)
  await repeatedEngine.init()
  const repeatedResults = []
  for (const [index, input] of [200.2, 200.2, 199.7, 202.8].entries()) {
    repeatedResults.push((await repeatedEngine.detectVideo(bitmap(), input)).status)
    if (index === 0) repeatedEngine.bumpSession()
  }
  const sentTimes = detectPosts(repeated).map((msg) => msg.timestampMs)
  cases.push({
    name: 'worker inference timestamps stay strictly increasing across repeat, rewind and camera bump',
    passed:
      sentTimes.join(',') === '201,202,203,204' &&
      repeatedResults.every((status) => status === 'frame') &&
      nextPoseInferenceTimestampMs(0.1, -1) === 1,
    detail: `sent=${sentTimes.join(',')} results=${repeatedResults.join(',')}`,
  })
  await repeatedEngine.dispose()

  const stale = new FakeWorker()
  stale.detect = 'hang'
  const staleEngine = engineWith(stale)
  await staleEngine.init()
  const pending = staleEngine.detectVideo(bitmap(), 21)
  staleEngine.bumpSession()
  const dropped = await pending
  const nextP = staleEngine.detectVideo(bitmap(), 22)
  stale.emit({
    type: 'FRAME',
    sessionId: 1,
    frame: {
      timestampMs: 22,
      videoWidth: 8,
      videoHeight: 8,
      landmarks: [{ x: 0, y: 0, z: 0, visibility: 1 }],
      engine: 'mediapipe',
    },
  })
  const next = await nextP
  cases.push({
    name: 'old frame replies discarded after session bump',
    passed: dropped.status === 'dropped' && next.status === 'timeout',
    detail: `dropped=${dropped.status} late=${next.status}`,
  })
  await staleEngine.dispose()

  const missWorker = new FakeWorker()
  missWorker.detect = 'miss'
  const missEngine = engineWith(missWorker)
  await missEngine.init()
  let failCount = 0
  const missResults = []
  for (let i = 0; i < 12; i += 1) {
    const result = await missEngine.detectVideo(bitmap(), 100 + i)
    missResults.push(result.status)
    failCount = applyDetectToRuntimeFails(failCount, result.status)
  }
  cases.push({
    name: 'MISS is not a detect timeout',
    passed: missResults.every((status) => status === 'miss') && failCount === 0 && !shouldMarkWorkerTimeout(failCount),
    detail: `statuses=${missResults.slice(0, 3).join(',')}… fails=${failCount}`,
  })
  await missEngine.dispose()

  const hang = new FakeWorker()
  hang.detect = 'hang'
  const hangEngine = engineWith(hang)
  await hangEngine.init()
  const t0 = Date.now()
  const timed = await hangEngine.detectVideo(bitmap(), 200)
  const elapsed = Date.now() - t0
  let timeouts = 0
  for (let i = 0; i < POSE_RUNTIME_FAIL_LIMIT; i += 1) {
    timeouts = applyDetectToRuntimeFails(timeouts, timed.status)
  }
  cases.push({
    name: 'real detect timeout is distinct and marks worker',
    passed:
      timed.status === 'timeout' &&
      elapsed >= POSE_DETECT_TIMEOUT_MS - 20 &&
      shouldMarkWorkerTimeout(timeouts),
    detail: `status=${timed.status} elapsed=${elapsed}ms fails=${timeouts}`,
  })
  await hangEngine.dispose()

  const early = new FakeWorker()
  early.readyDelayMs = 30
  const earlyEngine = engineWith(early)
  const beforeReady = earlyEngine.detectVideo(bitmap(), 1)
  const starting = earlyEngine.init()
  const notReady = await beforeReady
  cases.push({
    name: 'detect before INIT success is not_ready, not timeout',
    passed: notReady.status === 'not_ready' && detectPosts(early).length === 0,
    detail: `status=${notReady.status} detects=${detectPosts(early).length}`,
  })
  await starting
  await earlyEngine.dispose()

  const mediaTs = 2000
  const received = poseReceiveTime(50_000)
  const mixedClocks = poseFreshness(mediaTs, received)
  const sameClock = poseFreshness(received, received)
  const afterWait = poseFreshness(received, received + 200)
  const pausedHold = poseFreshness(received, received + POSE_LOST_MS + 50, { hold: 'static' })
  const stillHold = poseFreshness(received, received + 5_000, {
    hold: poseHoldForSource({ source: 'file', paused: true, staticCheck: true }),
  })
  const playingFile = poseFreshness(received, received + POSE_STALE_MS + 20, {
    hold: poseHoldForSource({ source: 'file', paused: false, staticCheck: false }),
  })
  const fixture = {
    timestampMs: mediaTs,
    videoWidth: 8,
    videoHeight: 8,
    landmarks: [{ x: 0, y: 0, z: 0, visibility: 1 }],
    engine: 'synthetic' as const,
  }
  cases.push({
    name: 'freshness uses receive time, not media timestampMs',
    passed: mixedClocks.status === 'lost' && sameClock.status === 'live' && afterWait.status === 'live',
    detail: `mediaVsNow=${mixedClocks.status} receive=${sameClock.status} wait=${afterWait.status}`,
  })
  cases.push({
    name: 'paused file / still is static and stays ready after wait',
    passed:
      pausedHold.status === 'static' &&
      stillHold.status === 'static' &&
      poseIsReady(pausedHold, fixture) &&
      poseIsReady(stillHold, fixture) &&
      playingFile.status === 'stale',
    detail: `paused=${pausedHold.status} still=${stillHold.status} playing=${playingFile.status}`,
  })
  cases.push({
    name: 'seek invalidates freshness to idle, not false live',
    passed: poseFreshness(null, received).status === 'idle' && !poseIsReady(poseFreshness(null, received), fixture),
    detail: 'idle after pose reset',
  })

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `POSE_HARNESS_OK — ${cases.length} checks.`
        : `POSE_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
