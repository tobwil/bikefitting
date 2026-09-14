import { POSE_HEAVY_ENABLED, POSE_HEAVY_REASON } from '../../config/models.ts'
import { createPoseEngine, type PoseEngineHandle } from '../createPoseEngine.ts'
import type { PoseDetectResult, PoseModelVariant } from '../../types/pose-engine.ts'
import type { PoseCompareFrame } from '../../types/pose-compare.ts'
import { bitmapFromPixels } from './clips.ts'

export type CachedModel = {
  model: PoseModelVariant
  engine: PoseEngineHandle
  initMs: number
}

export type ModelCacheOptions = {
  createEngine?: () => PoseEngineHandle
  /** Injected detect for Node harness / simulated tracks. */
  detect?: (model: PoseModelVariant, frame: PoseCompareFrame) => Promise<PoseDetectResult>
  load?: (model: PoseModelVariant) => Promise<{ initMs: number }>
}

export type ModelCache = {
  ensure(model: PoseModelVariant): Promise<{ initMs: number; cached: boolean }>
  isLoaded(model: PoseModelVariant): boolean
  loaded(): PoseModelVariant[]
  detect(model: PoseModelVariant, frame: PoseCompareFrame): Promise<PoseDetectResult>
  abort(): number
  dispose(): Promise<void>
  generation(): number
  switching(): boolean
  refuseHeavy(): { ok: false; reason: string }
}

const STUB_BITMAP = {
  width: 8,
  height: 8,
  close() {},
} as ImageBitmap

export function refuseHeavyModel(): { ok: false; reason: string } {
  return { ok: false, reason: POSE_HEAVY_ENABLED ? 'heavy-enabled' : POSE_HEAVY_REASON }
}

export function createModelCache(options: ModelCacheOptions = {}): ModelCache {
  const engines = new Map<PoseModelVariant, CachedModel>()
  let gen = 1
  let switchTail: Promise<void> = Promise.resolve()
  let inSwitch = false

  const enqueue = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = switchTail
    let release!: () => void
    switchTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await prev
    inSwitch = true
    try {
      return await fn()
    } finally {
      inSwitch = false
      release()
    }
  }

  return {
    generation() {
      return gen
    },
    switching() {
      return inSwitch
    },
    isLoaded(model) {
      return engines.has(model)
    },
    loaded() {
      return [...engines.keys()]
    },
    refuseHeavy() {
      return refuseHeavyModel()
    },
    abort() {
      gen += 1
      return gen
    },
    async dispose() {
      gen += 1
      const all = [...engines.values()]
      engines.clear()
      await Promise.all(all.map((row) => row.engine.dispose()))
    },
    async ensure(model) {
      if (model === ('heavy' as PoseModelVariant)) {
        throw new Error(refuseHeavyModel().reason)
      }
      const born = gen
      return enqueue(async () => {
        if (born !== gen) throw new Error('Pose-Modellwechsel abgebrochen.')
        const hit = engines.get(model)
        if (hit) return { initMs: hit.initMs, cached: true }
        const t0 = nowMs()
        if (options.load) {
          const loaded = await options.load(model)
          if (born !== gen) throw new Error('Pose-Modellwechsel abgebrochen.')
          engines.set(model, {
            model,
            engine: options.createEngine?.() ?? createDummyEngine(),
            initMs: loaded.initMs,
          })
          return { initMs: loaded.initMs, cached: false }
        }
        const engine = options.createEngine?.() ?? createPoseEngine()
        await engine.init({ model })
        if (born !== gen) {
          await engine.dispose()
          throw new Error('Pose-Modellwechsel abgebrochen.')
        }
        const initMs = nowMs() - t0
        engines.set(model, { model, engine, initMs })
        return { initMs, cached: false }
      })
    },
    async detect(model, frame) {
      if (options.detect) return options.detect(model, frame)
      const row = engines.get(model)
      if (!row) return { status: 'not_ready' }
      if (frame.pixels && typeof createImageBitmap === 'function') {
        const bitmap = await bitmapFromPixels(frame.pixels)
        return row.engine.detectVideo(bitmap, frame.timestampMs)
      }
      return row.engine.detectVideo(STUB_BITMAP, frame.timestampMs)
    },
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function createDummyEngine(): PoseEngineHandle {
  return {
    id: 'mediapipe',
    async init() {},
    async detectVideo(bitmap) {
      bitmap.close()
      return { status: 'miss' }
    },
    async dispose() {},
    bumpSession() {
      return 1
    },
    sessionId() {
      return 1
    },
    initGeneration() {
      return 1
    },
    isReady() {
      return true
    },
    isGraphFatal() {
      return false
    },
    model() {
      return 'lite'
    },
    retry: async () => {},
    onError() {},
    injectGraphFatal() {},
  }
}
