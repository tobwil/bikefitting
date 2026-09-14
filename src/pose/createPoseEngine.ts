import { POSE_MODEL_FILES, WASM_BASE_URL } from '../config/models.ts'
import type {
  PoseDetectResult,
  PoseEngine,
  PoseEngineOptions,
  PoseWorkerRequest,
  PoseWorkerResponse,
} from '../types/pose-engine.ts'
import { DEFAULT_POSE_ENGINE_OPTIONS } from '../types/pose-engine.ts'
import { acceptSessionReply, POSE_DETECT_TIMEOUT_MS, POSE_INIT_TIMEOUT_MS } from './freshness.ts'

type Pending = {
  resolve: (result: PoseDetectResult) => void
  timer: ReturnType<typeof setTimeout>
  sessionId: number
}

export type PoseEngineFactory = {
  createWorker?: () => Worker
}

export type PoseEngineHandle = PoseEngine & {
  bumpSession(): number
  sessionId(): number
  initGeneration(): number
  isReady(): boolean
  isGraphFatal(): boolean
  model(): PoseEngineOptions['model']
  retry(options?: Partial<PoseEngineOptions>): Promise<void>
  onError(handler: ((message: string) => void) | null): void
}

/** MediaPipe VIDEO requires strictly increasing integer millisecond timestamps per landmarker. */
export function nextPoseInferenceTimestampMs(timestampMs: number, previousMs: number): number {
  const candidate = Number.isFinite(timestampMs) ? Math.ceil(timestampMs) : previousMs + 1
  return Math.max(candidate, previousMs + 1)
}

export function createPoseEngine(factory?: PoseEngineFactory): PoseEngineHandle {
  let worker: Worker | null = null
  let ready = false
  let currentModel: PoseEngineOptions['model'] = DEFAULT_POSE_ENGINE_OPTIONS.model
  /** Camera / frame generation — bump on stream switch; stale FRAME/MISS dropped. */
  let sessionId = 1
  /** INIT generation — bump only on init/retry/dispose, not on camera switch. */
  let initGeneration = 1
  let lastInferenceTimestampMs = -1
  let errorHandler: ((message: string) => void) | null = null
  let graphFatal = false
  const pending = new Map<number, Pending>()

  const settle = (timestampMs: number, result: PoseDetectResult, incomingSession?: number) => {
    const wait = pending.get(timestampMs)
    if (!wait) return
    if (!acceptSessionReply(wait.sessionId, incomingSession ?? wait.sessionId)) {
      clearTimeout(wait.timer)
      pending.delete(timestampMs)
      wait.resolve({ status: 'dropped' })
      return
    }
    if (incomingSession !== undefined && incomingSession !== sessionId) {
      clearTimeout(wait.timer)
      pending.delete(timestampMs)
      wait.resolve({ status: 'dropped' })
      return
    }
    clearTimeout(wait.timer)
    pending.delete(timestampMs)
    wait.resolve(result)
  }

  const flushPending = (result: PoseDetectResult) => {
    for (const [ts, wait] of pending) {
      clearTimeout(wait.timer)
      pending.delete(ts)
      wait.resolve(result)
    }
  }

  const ensureWorker = () => {
    if (worker) return worker
    worker = factory?.createWorker
      ? factory.createWorker()
      : new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'READY') {
        if (!acceptSessionReply(initGeneration, msg.sessionId)) return
        ready = true
        return
      }
      if (msg.type === 'DISPOSED') {
        ready = false
        return
      }
      if (msg.type === 'FRAME') {
        if (!acceptSessionReply(sessionId, msg.sessionId)) return
        settle(msg.frame.timestampMs, { status: 'frame', frame: msg.frame }, msg.sessionId)
        return
      }
      if (msg.type === 'MISS') {
        if (!acceptSessionReply(sessionId, msg.sessionId)) return
        settle(msg.timestampMs, { status: 'miss' }, msg.sessionId)
        return
      }
      if (msg.type === 'ERROR') {
        const initOk = acceptSessionReply(initGeneration, msg.sessionId)
        const frameOk = acceptSessionReply(sessionId, msg.sessionId)
        if (!initOk && !frameOk) return
        graphFatal = true
        ready = false
        flushPending({ status: 'error', message: msg.message })
        errorHandler?.(msg.message)
      }
    }
    worker.onerror = () => {
      ready = false
      graphFatal = true
      flushPending({ status: 'error', message: 'Pose-Worker ist abgestürzt.' })
      errorHandler?.('Pose-Worker ist abgestürzt.')
    }
    return worker
  }

  const init = async (options?: Partial<PoseEngineOptions>) => {
    const merged = { ...DEFAULT_POSE_ENGINE_OPTIONS, ...options }
    currentModel = merged.model === 'full' ? 'full' : 'lite'
    const model = currentModel === 'full' ? POSE_MODEL_FILES.full : POSE_MODEL_FILES.lite
    const origin = globalThis.location?.origin ?? ''
    const bornInit = initGeneration
    const w = ensureWorker()
    ready = false
    lastInferenceTimestampMs = -1
    const req: PoseWorkerRequest = {
      type: 'INIT',
      options: { ...merged, assetsBaseUrl: merged.assetsBaseUrl || '/models' },
      modelAssetPath: `${origin}${model.url}`,
      wasmBaseUrl: `${origin}${WASM_BASE_URL}`,
      sessionId: bornInit,
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        w.removeEventListener('message', onMsg)
        reject(new Error(`Pose-Worker INIT Timeout (${POSE_INIT_TIMEOUT_MS} ms).`))
      }, POSE_INIT_TIMEOUT_MS)
      const onMsg = (event: MessageEvent<PoseWorkerResponse>) => {
        const msg = event.data
        if ('sessionId' in msg && msg.sessionId !== undefined && msg.sessionId !== bornInit) return
        if (msg.type === 'READY') {
          clearTimeout(timer)
          w.removeEventListener('message', onMsg)
          if (worker !== w || initGeneration !== bornInit) {
            reject(new Error('Pose-Worker INIT wurde durch einen neueren Start ersetzt.'))
            return
          }
          ready = true
          resolve()
        }
        if (msg.type === 'ERROR') {
          clearTimeout(timer)
          w.removeEventListener('message', onMsg)
          reject(new Error(msg.message))
        }
      }
      w.addEventListener('message', onMsg)
      w.postMessage(req)
    })
  }

  return {
    id: 'mediapipe',
    init,
    async detectVideo(bitmap: ImageBitmap, timestampMs: number) {
      const w = worker
      const born = sessionId
      if (graphFatal) {
        bitmap.close()
        return { status: 'error', message: 'Pose-Graph ist defekt. Neu starten.' }
      }
      if (!w || !ready) {
        bitmap.close()
        return { status: 'not_ready' }
      }
      // The frame callback's display time may repeat or move backwards after a
      // camera/stage remount. Keep the graph clock independent of that UI clock.
      const inferenceTimestampMs = nextPoseInferenceTimestampMs(timestampMs, lastInferenceTimestampMs)
      lastInferenceTimestampMs = inferenceTimestampMs
      return new Promise<PoseDetectResult>((resolve) => {
        const timer = setTimeout(() => {
          const wait = pending.get(inferenceTimestampMs)
          if (!wait || wait.sessionId !== born) return
          pending.delete(inferenceTimestampMs)
          resolve({ status: 'timeout' })
        }, POSE_DETECT_TIMEOUT_MS)
        pending.set(inferenceTimestampMs, { resolve, timer, sessionId: born })
        const req: PoseWorkerRequest = {
          type: 'DETECT_VIDEO',
          bitmap,
          timestampMs: inferenceTimestampMs,
          videoWidth: bitmap.width,
          videoHeight: bitmap.height,
          sessionId: born,
        }
        w.postMessage(req, [bitmap])
      })
    },
    async dispose() {
      flushPending({ status: 'dropped' })
      ready = false
      initGeneration += 1
      worker?.postMessage({ type: 'DISPOSE' } satisfies PoseWorkerRequest)
      worker?.terminate()
      worker = null
    },
    bumpSession() {
      sessionId += 1
      flushPending({ status: 'dropped' })
      return sessionId
    },
    sessionId() {
      return sessionId
    },
    initGeneration() {
      return initGeneration
    },
    isReady() {
      return ready
    },
    isGraphFatal() {
      return graphFatal
    },
    model() {
      return currentModel
    },
    onError(handler) {
      errorHandler = handler
    },
    async retry(options?: Partial<PoseEngineOptions>) {
      flushPending({ status: 'dropped' })
      ready = false
      graphFatal = false
      initGeneration += 1
      sessionId += 1
      worker?.terminate()
      worker = null
      await init(options)
    },
  }
}

export function isWorkerReady(engine: PoseEngine): boolean {
  return engine.id === 'mediapipe'
}
