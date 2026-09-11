import type { PoseEngine, PoseEngineOptions } from '../types/pose-engine.ts'
import { DEFAULT_POSE_ENGINE_OPTIONS } from '../types/pose-engine.ts'

export function createPoseEngine(): PoseEngine {
  return {
    id: 'mediapipe-stub',
    async init(_options?: Partial<PoseEngineOptions>) {
      void DEFAULT_POSE_ENGINE_OPTIONS
    },
    async detectVideo(bitmap: ImageBitmap, _timestampMs: number) {
      bitmap.close()
      return null
    },
    async dispose() {
      /* pose strand */
    },
  }
}
