import { useEffect, useRef, useState } from 'react'
import type { CaptureAsset, CapturePhase } from '../types/capture.ts'
import type { AnalysisJob } from '../types/analysis.ts'
import { getCaptureStore } from '../capture/storage.ts'
import { shouldAutoStartAnalysis } from './autoStart.ts'
import { createAnalysisController, type AnalysisController } from './controller.ts'
import { createEnginePoseSource } from './poseBrowser.ts'

export type AnalysisSessionApi = {
  job: AnalysisJob | null
  retry: () => Promise<void>
  cancel: () => void
}

export function useAnalysisJob(input: {
  phase: CapturePhase
  asset: CaptureAsset | null
  blob: Blob | null
}): AnalysisSessionApi {
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const controllerRef = useRef<AnalysisController | null>(null)
  const poseRef = useRef<ReturnType<typeof createEnginePoseSource> | null>(null)
  const startedFor = useRef<string | null>(null)

  useEffect(() => {
    poseRef.current = createEnginePoseSource()
    const controller = createAnalysisController({
      store: getCaptureStore(),
      pose: poseRef.current,
    })
    controllerRef.current = controller
    const stop = controller.subscribe(setJob)
    return () => {
      stop()
      controller.clear()
      void poseRef.current?.close?.()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (input.phase !== 'saved' || !input.asset || !input.blob) return
    const key = `${input.asset.captureId}:${input.asset.contentHash}`
    if (startedFor.current === key) return
    if (
      !shouldAutoStartAnalysis({
        capturePhase: input.phase,
        completeness: input.asset.completeness,
        jobPhase: null,
      })
    ) {
      return
    }
    startedFor.current = key
    void controllerRef.current?.enqueueSaved(input.asset, input.blob)
  }, [input.asset, input.blob, input.phase])

  useEffect(() => {
    if (input.phase !== 'idle') return
    startedFor.current = null
    controllerRef.current?.clear()
  }, [input.phase])

  return {
    job,
    retry: async () => {
      await controllerRef.current?.retrySameBytes()
    },
    cancel: () => controllerRef.current?.cancel(),
  }
}
