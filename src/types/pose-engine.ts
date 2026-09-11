import type { PoseFrame } from './landmarks.ts'

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
  detectVideo(bitmap: ImageBitmap, timestampMs: number): Promise<PoseFrame | null>
  dispose(): Promise<void>
}

export type PoseWorkerRequest =
  | {
      type: 'INIT'
      options: PoseEngineOptions
      modelAssetPath: string
      wasmBaseUrl: string
    }
  | {
      type: 'DETECT_VIDEO'
      bitmap: ImageBitmap
      timestampMs: number
      videoWidth: number
      videoHeight: number
    }
  | { type: 'DISPOSE' }

export type PoseWorkerResponse =
  | { type: 'READY' }
  | { type: 'FRAME'; frame: PoseFrame }
  | { type: 'ERROR'; message: string }
  | { type: 'DISPOSED' }
