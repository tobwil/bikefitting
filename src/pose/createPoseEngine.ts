import { POSE_MODEL_FILES, WASM_BASE_URL } from '../config/models.ts'
import type { PoseEngine, PoseEngineOptions, PoseWorkerRequest, PoseWorkerResponse } from '../types/pose-engine.ts'
import { DEFAULT_POSE_ENGINE_OPTIONS } from '../types/pose-engine.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { acceptSessionReply, POSE_DETECT_TIMEOUT_MS, POSE_INIT_TIMEOUT_MS } from './freshness.ts'

type Pending = {
  resolve: (frame: PoseFrame | null) => void
  timer: ReturnType<typeof setTimeout>
  sessionId: number
}

export type PoseEngineHandle = PoseEngine & {
  bumpSession(): number
  sessionId(): number
  retry(options?: Partial<PoseEngineOptions>): Promise<void>
  onError(handler: ((message: string) => void) | null): void
}

export function createPoseEngine(): PoseEngineHandle {
  let worker: Worker | null = null
  let ready = false
  let sessionId = 1
  let errorHandler: ((message: string) => void) | null = null
  const pending = new Map<number, Pending>()

  const settle = (timestampMs: number, frame: PoseFrame | null, incomingSession?: number) => {
    const wait = pending.get(timestampMs)
    if (!wait) return
    if (!acceptSessionReply(wait.sessionId, incomingSession ?? wait.sessionId)) {
      clearTimeout(wait.timer)
      pending.delete(timestampMs)
      wait.resolve(null)
      return
    }
    if (incomingSession !== undefined && incomingSession !== sessionId) {
      clearTimeout(wait.timer)
      pending.delete(timestampMs)
      wait.resolve(null)
      return
    }
    clearTimeout(wait.timer)
    pending.delete(timestampMs)
    wait.resolve(frame)
  }

  const flushPending = () => {
    for (const [ts] of pending) settle(ts, null, sessionId)
  }

  const ensureWorker = () => {
    if (worker) return worker
    worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
      const msg = event.data
      if ('sessionId' in msg && msg.sessionId !== undefined && msg.sessionId !== sessionId) {
        return
      }
      if (msg.type === 'READY') ready = true
      if (msg.type === 'FRAME') settle(msg.frame.timestampMs, msg.frame, msg.sessionId)
      if (msg.type === 'MISS') settle(msg.timestampMs, null, msg.sessionId)
      if (msg.type === 'ERROR') {
        flushPending()
        errorHandler?.(msg.message)
      }
      if (msg.type === 'DISPOSED') {
        ready = false
      }
    }
    worker.onerror = () => {
      ready = false
      flushPending()
      errorHandler?.('Pose-Worker ist abgestürzt.')
    }
    return worker
  }

  const init = async (options?: Partial<PoseEngineOptions>) => {
    const merged = { ...DEFAULT_POSE_ENGINE_OPTIONS, ...options }
    const model = merged.model === 'full' ? POSE_MODEL_FILES.full : POSE_MODEL_FILES.lite
    const origin = globalThis.location?.origin ?? ''
    const born = sessionId
    const w = ensureWorker()
    ready = false
    const req: PoseWorkerRequest = {
      type: 'INIT',
      options: { ...merged, assetsBaseUrl: merged.assetsBaseUrl || '/models' },
      modelAssetPath: `${origin}${model.url}`,
      wasmBaseUrl: `${origin}${WASM_BASE_URL}`,
      sessionId: born,
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        w.removeEventListener('message', onMsg)
        reject(new Error(`Pose-Worker INIT Timeout (${POSE_INIT_TIMEOUT_MS} ms).`))
      }, POSE_INIT_TIMEOUT_MS)
      const onMsg = (event: MessageEvent<PoseWorkerResponse>) => {
        const msg = event.data
        if ('sessionId' in msg && msg.sessionId !== undefined && msg.sessionId !== born) return
        if (msg.type === 'READY') {
          clearTimeout(timer)
          w.removeEventListener('message', onMsg)
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
      if (!w || !ready) {
        bitmap.close()
        return null
      }
      return new Promise<PoseFrame | null>((resolve) => {
        const timer = setTimeout(() => {
          const wait = pending.get(timestampMs)
          if (!wait || wait.sessionId !== born) return
          pending.delete(timestampMs)
          resolve(null)
        }, POSE_DETECT_TIMEOUT_MS)
        pending.set(timestampMs, { resolve, timer, sessionId: born })
        const req: PoseWorkerRequest = {
          type: 'DETECT_VIDEO',
          bitmap,
          timestampMs,
          videoWidth: bitmap.width,
          videoHeight: bitmap.height,
          sessionId: born,
        }
        w.postMessage(req, [bitmap])
      })
    },
    async dispose() {
      flushPending()
      ready = false
      worker?.postMessage({ type: 'DISPOSE' } satisfies PoseWorkerRequest)
      worker?.terminate()
      worker = null
    },
    bumpSession() {
      sessionId += 1
      flushPending()
      return sessionId
    },
    sessionId() {
      return sessionId
    },
    onError(handler) {
      errorHandler = handler
    },
    async retry(options?: Partial<PoseEngineOptions>) {
      flushPending()
      ready = false
      worker?.terminate()
      worker = null
      sessionId += 1
      await init(options)
    },
  }
}

export function isWorkerReady(engine: PoseEngine): boolean {
  return engine.id === 'mediapipe'
}
