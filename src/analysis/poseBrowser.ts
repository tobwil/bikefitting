import { createPoseEngine, type PoseEngineHandle } from '../pose/createPoseEngine.ts'
import type { PoseSource } from './run.ts'

export function createEnginePoseSource(engine?: PoseEngineHandle): PoseSource {
  const handle = engine ?? createPoseEngine()
  let prepared = false
  return {
    async prepare() {
      if (prepared && handle.isReady()) return
      await handle.init({ model: 'lite' })
      prepared = true
    },
    async detect(frame, inferenceTimestampMs, token) {
      if (!token.isCurrent()) {
        frame.bitmap?.close()
        return { status: 'dropped' }
      }
      if (!frame.bitmap) return { status: 'miss' }
      const result = await handle.detectVideo(frame.bitmap, inferenceTimestampMs)
      if (!token.isCurrent()) return { status: 'dropped' }
      return result
    },
    async close() {
      await handle.dispose()
    },
  }
}
