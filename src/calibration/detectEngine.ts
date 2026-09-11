import { detectBikeFromPixels, type BikeDetectOutput, type DetectSource } from './detect.ts'
import type { PixelImage } from './pixels.ts'
import type { DetectWorkerRequest, DetectWorkerResponse } from './detect.worker.ts'

export type DetectJobResult =
  | { status: 'ok'; output: BikeDetectOutput; generation: number }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export type DetectEngine = {
  detect(
    image: PixelImage,
    opts: {
      generation: number
      riderPresent?: boolean
      source?: DetectSource
      onProgress?: (progress: number, message?: string) => void
    },
  ): Promise<DetectJobResult>
  cancel(): void
  dispose(): void
}

type Pending = {
  requestId: number
  generation: number
  resolve: (result: DetectJobResult) => void
  onProgress?: (progress: number, message?: string) => void
}

/**
 * Off-UI-thread bike prototype detect. Stale generations are discarded.
 * Falls back to a yielded main-thread run if Worker is unavailable (tests).
 */
export function createDetectEngine(): DetectEngine {
  let worker: Worker | null = null
  let requestId = 0
  let activeGeneration = 0
  let pending: Pending | null = null

  const settle = (result: DetectJobResult, incomingGen?: number) => {
    if (!pending) return
    if (incomingGen !== undefined && incomingGen !== pending.generation) {
      pending.resolve({ status: 'cancelled' })
      pending = null
      return
    }
    const wait = pending
    pending = null
    wait.resolve(result)
  }

  const ensureWorker = (): Worker | null => {
    if (worker) return worker
    if (typeof Worker === 'undefined') return null
    try {
      worker = new Worker(new URL('./detect.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      worker = null
      return null
    }
    worker.onmessage = (event: MessageEvent<DetectWorkerResponse>) => {
      const msg = event.data
      if (!pending || msg.requestId !== pending.requestId) return
      if (msg.generation !== pending.generation || msg.generation !== activeGeneration) {
        settle({ status: 'cancelled' }, msg.generation)
        return
      }
      if (msg.type === 'PROGRESS') {
        pending.onProgress?.(msg.progress, msg.message)
        return
      }
      if (msg.type === 'RESULT') {
        settle({ status: 'ok', output: msg.output, generation: msg.generation }, msg.generation)
        return
      }
      if (msg.type === 'ERROR') {
        settle({ status: 'error', message: msg.message }, msg.generation)
      }
    }
    worker.onerror = () => {
      settle({ status: 'error', message: 'Detect-Worker ist abgestürzt.' })
    }
    return worker
  }

  const runOnMain = async (
    image: PixelImage,
    opts: {
      generation: number
      riderPresent?: boolean
      source?: DetectSource
      onProgress?: (progress: number, message?: string) => void
      requestId: number
    },
  ): Promise<DetectJobResult> => {
    await new Promise<void>((resolve) => {
      if (typeof setTimeout === 'undefined') resolve()
      else setTimeout(resolve, 0)
    })
    if (opts.generation !== activeGeneration || pending?.requestId !== opts.requestId) {
      return { status: 'cancelled' }
    }
    const output = detectBikeFromPixels(image, {
      riderPresent: opts.riderPresent,
      source: opts.source,
      shouldCancel: () => opts.generation !== activeGeneration,
      onProgress: opts.onProgress,
    })
    if (opts.generation !== activeGeneration) return { status: 'cancelled' }
    return { status: 'ok', output, generation: opts.generation }
  }

  return {
    detect(image, opts) {
      const id = ++requestId
      activeGeneration = opts.generation
      if (pending) {
        const prev = pending
        pending = null
        prev.resolve({ status: 'cancelled' })
      }

      return new Promise<DetectJobResult>((resolve) => {
        pending = {
          requestId: id,
          generation: opts.generation,
          resolve,
          onProgress: opts.onProgress,
        }
        const w = ensureWorker()
        if (!w) {
          void runOnMain(image, { ...opts, requestId: id }).then((result) => {
            if (pending?.requestId !== id) return
            settle(result, opts.generation)
          })
          return
        }
        const copy = image.data.slice()
        const req: DetectWorkerRequest = {
          type: 'DETECT',
          requestId: id,
          generation: opts.generation,
          width: image.width,
          height: image.height,
          data: copy,
          riderPresent: opts.riderPresent ?? false,
          source: opts.source ?? 'unknown',
        }
        w.postMessage(req, [copy.buffer])
      })
    },
    cancel() {
      activeGeneration += 1
      worker?.postMessage({ type: 'CANCEL' } satisfies DetectWorkerRequest)
      settle({ status: 'cancelled' })
    },
    dispose() {
      activeGeneration += 1
      settle({ status: 'cancelled' })
      worker?.terminate()
      worker = null
    },
  }
}
