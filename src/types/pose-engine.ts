import type { PoseFrame } from './landmarks.ts'

export type PoseDetectStatus = 'frame' | 'miss' | 'timeout' | 'dropped' | 'not_ready' | 'error'

export type PoseDetectResult =
  | { status: 'frame'; frame: PoseFrame }
  | { status: 'miss' }
  | { status: 'timeout' }
  | { status: 'dropped' }
  | { status: 'not_ready' }
  | { status: 'error'; message: string }

export type PoseModelVariant = 'lite' | 'full'

export type PoseEngineOptions = {
  model: PoseModelVariant
  minVisibility: number
  minPoseDetectionConfidence: number
  minPosePresenceConfidence: number
  minTrackingConfidence: number
  assetsBaseUrl: string
}

export const DEFAULT_POSE_ENGINE_OPTIONS: PoseEngineOptions = {
  model: 'lite',
  minVisibility: 0.75,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  assetsBaseUrl: '/models',
}

export interface PoseEngine {
  readonly id: string
  init(options?: Partial<PoseEngineOptions>): Promise<void>
  detectVideo(bitmap: ImageBitmap, timestampMs: number): Promise<PoseDetectResult>
  dispose(): Promise<void>
}

export type PoseWorkerRequest =
  | {
      type: 'INIT'
      options: PoseEngineOptions
      modelAssetPath: string
      wasmBaseUrl: string
      sessionId?: number
    }
  | {
      type: 'DETECT_VIDEO'
      bitmap: ImageBitmap
      timestampMs: number
      videoWidth: number
      videoHeight: number
      sessionId?: number
    }
  | { type: 'DISPOSE' }

export type PoseWorkerResponse =
  | { type: 'READY'; sessionId?: number }
  | { type: 'FRAME'; frame: PoseFrame; sessionId?: number }
  | { type: 'MISS'; timestampMs: number; sessionId?: number }
  | { type: 'ERROR'; message: string; sessionId?: number }
  | { type: 'DISPOSED'; sessionId?: number }
