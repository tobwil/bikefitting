/// <reference lib="webworker" />

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { Landmark, PoseFrame } from '../types/landmarks.ts'
import type { PoseModelVariant, PoseWorkerRequest, PoseWorkerResponse } from '../types/pose-engine.ts'

let landmarker: PoseLandmarker | null = null
let activeModel: PoseModelVariant = 'lite'

function modelFromPath(path: string): PoseModelVariant {
  return path.includes('pose_landmarker_full') ? 'full' : 'lite'
}

function mapLandmarks(raw: Array<{ x: number; y: number; z: number; visibility?: number; presence?: number }>): Landmark[] {
  return raw.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility ?? 0,
    presence: lm.presence,
  }))
}

function post(msg: PoseWorkerResponse, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    self.postMessage(msg, transfer)
    return
  }
  self.postMessage(msg)
}

async function initLandmarker(req: Extract<PoseWorkerRequest, { type: 'INIT' }>) {
  // useModule=true loads vision_wasm_module_internal.js which assigns
  // globalThis.ModuleFactory (required inside Vite's ES module workers).
  const vision = await FilesetResolver.forVisionTasks(req.wasmBaseUrl, true)
  const shared = {
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    minPoseDetectionConfidence: req.options.minPoseDetectionConfidence,
    minPosePresenceConfidence: req.options.minPosePresenceConfidence,
    minTrackingConfidence: req.options.minTrackingConfidence,
  }
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      ...shared,
      baseOptions: { modelAssetPath: req.modelAssetPath, delegate: 'GPU' },
    })
  } catch {
    return PoseLandmarker.createFromOptions(vision, {
      ...shared,
      baseOptions: { modelAssetPath: req.modelAssetPath, delegate: 'CPU' },
    })
  }
}

self.onmessage = (event: MessageEvent<PoseWorkerRequest>) => {
  const msg = event.data
  void (async () => {
    if (msg.type === 'INIT') {
      try {
        landmarker?.close()
        activeModel = modelFromPath(msg.modelAssetPath)
        landmarker = await initLandmarker(msg)
        post({ type: 'READY', sessionId: msg.sessionId, model: activeModel })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Pose worker INIT failed.'
        post({ type: 'ERROR', message, sessionId: msg.sessionId })
      }
      return
    }

    if (msg.type === 'DETECT_VIDEO') {
      if (!landmarker) {
        msg.bitmap.close()
        post({ type: 'ERROR', message: 'Pose worker is not ready.', sessionId: msg.sessionId })
        return
      }
      const t0 = performance.now()
      try {
        const result = landmarker.detectForVideo(msg.bitmap, msg.timestampMs)
        const inferenceMs = performance.now() - t0
        const pose = result.landmarks[0]
        if (!pose || pose.length === 0) {
          post({ type: 'MISS', timestampMs: msg.timestampMs, sessionId: msg.sessionId })
          return
        }
        const frame: PoseFrame = {
          timestampMs: msg.timestampMs,
          videoWidth: msg.videoWidth,
          videoHeight: msg.videoHeight,
          landmarks: mapLandmarks(pose),
          worldLandmarks: result.worldLandmarks[0]
            ? mapLandmarks(result.worldLandmarks[0])
            : undefined,
          inferenceMs,
          engine: 'mediapipe',
          model: activeModel,
        }
        post({ type: 'FRAME', frame, sessionId: msg.sessionId })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'detectForVideo failed.'
        post({ type: 'ERROR', message, sessionId: msg.sessionId })
      } finally {
        msg.bitmap.close()
      }
      return
    }

    if (msg.type === 'DISPOSE') {
      landmarker?.close()
      landmarker = null
      post({ type: 'DISPOSED' })
    }
  })()
}
