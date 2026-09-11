/// <reference lib="webworker" />

import { detectBikeFromPixels, type BikeDetectOutput, type DetectSource } from './detect.ts'

export type DetectWorkerRequest =
  | {
      type: 'DETECT'
      requestId: number
      generation: number
      width: number
      height: number
      data: Uint8ClampedArray
      riderPresent: boolean
      source: DetectSource
    }
  | {
      type: 'CANCEL'
      requestId?: number
    }

export type DetectWorkerResponse =
  | {
      type: 'PROGRESS'
      requestId: number
      generation: number
      progress: number
      message?: string
    }
  | {
      type: 'RESULT'
      requestId: number
      generation: number
      output: BikeDetectOutput
    }
  | {
      type: 'ERROR'
      requestId: number
      generation: number
      message: string
    }

let activeRequest = 0
let cancelFlag = false

function post(msg: DetectWorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, transfer)
    return
  }
  self.postMessage(msg)
}

self.onmessage = (event: MessageEvent<DetectWorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'CANCEL') {
    cancelFlag = true
    return
  }
  if (msg.type !== 'DETECT') return

  activeRequest = msg.requestId
  cancelFlag = false
  const born = msg.requestId
  try {
    const image = { width: msg.width, height: msg.height, data: msg.data }
    const output = detectBikeFromPixels(image, {
      riderPresent: msg.riderPresent,
      source: msg.source,
      shouldCancel: () => cancelFlag || activeRequest !== born,
      onProgress: (progress, message) => {
        if (cancelFlag || activeRequest !== born) return
        post({ type: 'PROGRESS', requestId: born, generation: msg.generation, progress, message })
      },
    })
    if (cancelFlag || activeRequest !== born) return
    post({ type: 'RESULT', requestId: born, generation: msg.generation, output })
  } catch (error: unknown) {
    if (cancelFlag || activeRequest !== born) return
    post({
      type: 'ERROR',
      requestId: born,
      generation: msg.generation,
      message: error instanceof Error ? error.message : 'Detect worker failed.',
    })
  }
}
