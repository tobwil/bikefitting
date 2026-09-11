import { POSE_MODEL_FILES, WASM_BASE_URL } from '../config/models.ts'
import type { PoseEngine, PoseEngineOptions, PoseWorkerRequest, PoseWorkerResponse } from '../types/pose-engine.ts'
import { DEFAULT_POSE_ENGINE_OPTIONS } from '../types/pose-engine.ts'
import type { PoseFrame } from '../types/landmarks.ts'

type Pending = {
  resolve: (frame: PoseFrame | null) => void
  timer: ReturnType<typeof setTimeout>
}

export function createPoseEngine(): PoseEngine {
  let worker: Worker | null = null
  let ready = false
  const pending = new Map<number, Pending>()

  const settle = (timestampMs: number, frame: PoseFrame | null) => {
    const wait = pending.get(timestampMs)
    if (!wait) return
    clearTimeout(wait.timer)
    pending.delete(timestampMs)
    wait.resolve(frame)
  }

  const ensureWorker = () => {
    if (worker) return worker
    worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<PoseWorkerResponse>) => {
      const msg = event.data
      if (msg.type === 'READY') ready = true
      if (msg.type === 'FRAME') settle(msg.frame.timestampMs, msg.frame)
      if (msg.type === 'ERROR') {
        for (const [ts] of pending) settle(ts, null)
      }
      if (msg.type === 'DISPOSED') {
        ready = false
      }
    }
    worker.onerror = () => {
      ready = false
      for (const [ts] of pending) settle(ts, null)
    }
    return worker
  }

  return {
    id: 'mediapipe',
    async init(options?: Partial<PoseEngineOptions>) {
      const merged = { ...DEFAULT_POSE_ENGINE_OPTIONS, ...options }
      const model = merged.model === 'full' ? POSE_MODEL_FILES.full : POSE_MODEL_FILES.lite
      const origin = globalThis.location?.origin ?? ''
      const w = ensureWorker()
      ready = false
      const req: PoseWorkerRequest = {
        type: 'INIT',
        options: { ...merged, assetsBaseUrl: merged.assetsBaseUrl || '/models' },
        modelAssetPath: `${origin}${model.url}`,
        wasmBaseUrl: `${origin}${WASM_BASE_URL}`,
      }
      await new Promise<void>((resolve, reject) => {
        const onMsg = (event: MessageEvent<PoseWorkerResponse>) => {
          if (event.data.type === 'READY') {
            w.removeEventListener('message', onMsg)
            resolve()
          }
          if (event.data.type === 'ERROR') {
            w.removeEventListener('message', onMsg)
            reject(new Error(event.data.message))
          }
        }
        w.addEventListener('message', onMsg)
        w.postMessage(req)
      })
    },
    async detectVideo(bitmap: ImageBitmap, timestampMs: number) {
      const w = worker
      if (!w || !ready) {
        bitmap.close()
        return null
      }
      return new Promise<PoseFrame | null>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(timestampMs)
          resolve(null)
        }, 120)
        pending.set(timestampMs, { resolve, timer })
        const req: PoseWorkerRequest = {
          type: 'DETECT_VIDEO',
          bitmap,
          timestampMs,
          videoWidth: bitmap.width,
          videoHeight: bitmap.height,
        }
        w.postMessage(req, [bitmap])
      })
    },
    async dispose() {
      for (const [ts] of pending) settle(ts, null)
      ready = false
      worker?.postMessage({ type: 'DISPOSE' } satisfies PoseWorkerRequest)
      worker?.terminate()
      worker = null
    },
  }
}

export function isWorkerReady(engine: PoseEngine): boolean {
  return engine.id === 'mediapipe'
}
