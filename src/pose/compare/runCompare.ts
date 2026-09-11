import { DEFAULT_POSE_MODEL } from '../../config/models.ts'
import type { Landmark } from '../../types/landmarks.ts'
import type { PoseModelVariant } from '../../types/pose-engine.ts'
import type {
  PoseCompareClip,
  PoseCompareDetectorKind,
  PoseCompareProgress,
  PoseCompareReport,
} from '../../types/pose-compare.ts'
import { createModelCache, type ModelCache, type ModelCacheOptions } from './cache.ts'
import { decideCompare } from './decision.ts'
import { accumulateRun, compareTracks, emptyRunStats, finalizeRun } from './stats.ts'

export type CompareRunner = {
  cache: ModelCache
  run(clip: PoseCompareClip, opts?: { detector?: PoseCompareDetectorKind }): Promise<PoseCompareReport>
  abort(): void
  dispose(): Promise<void>
  progress(): PoseCompareProgress
}

const MODELS: PoseModelVariant[] = ['lite', 'full']

export function createCompareRunner(options: ModelCacheOptions = {}): CompareRunner {
  const cache = createModelCache(options)
  let progress: PoseCompareProgress = idleProgress()
  let runGen = 0

  return {
    cache,
    progress() {
      return progress
    },
    abort() {
      runGen += 1
      cache.abort()
      progress = { ...progress, phase: 'aborting', message: 'Vergleich abgebrochen.' }
    },
    dispose() {
      runGen += 1
      progress = idleProgress()
      return cache.dispose()
    },
    async run(clip, opts) {
      if (DEFAULT_POSE_MODEL !== 'lite') {
        throw new Error('Product default must stay Lite until a compare proves Full.')
      }
      const detector: PoseCompareDetectorKind = opts?.detector ?? (options.detect ? 'injected' : 'mediapipe')
      const born = ++runGen
      const liteTrack: Array<Landmark[] | null> = []
      const fullTrack: Array<Landmark[] | null> = []
      const liteInf: number[] = []
      const fullInf: number[] = []
      const lite = emptyRunStats('lite')
      const full = emptyRunStats('full')

      try {
        for (const model of MODELS) {
          if (born !== runGen) return abortedReport(clip, detector, lite, full)
          progress = {
            phase: 'loading',
            model,
            frameIndex: 0,
            frameCount: clip.frames.length,
            message: `${model} wird geladen (nur Labor, nicht Produkt).`,
          }
          const loaded = await cache.ensure(model)
          if (born !== runGen) return abortedReport(clip, detector, lite, full)
          if (model === 'lite') lite.initMs = loaded.initMs
          else full.initMs = loaded.initMs

          progress = {
            phase: 'running',
            model,
            frameIndex: 0,
            frameCount: clip.frames.length,
            message: `${model} · ${clip.frames.length} Frames`,
          }
          const track = model === 'lite' ? liteTrack : fullTrack
          const inf = model === 'lite' ? liteInf : fullInf
          const stats = model === 'lite' ? lite : full
          for (let i = 0; i < clip.frames.length; i += 1) {
            if (born !== runGen) return abortedReport(clip, detector, lite, full)
            const frame = clip.frames[i]
            if (!frame) continue
            progress = { ...progress, frameIndex: i + 1 }
            const result = await cache.detect(model, frame)
            if (born !== runGen) return abortedReport(clip, detector, lite, full)
            const detected = accumulateRun(stats, result, inf)
            track.push(detected?.landmarks ?? null)
          }
        }

        finalizeRun(lite, liteInf)
        finalizeRun(full, fullInf)
        const { landmarkError, angleDeltas } = compareTracks(liteTrack, fullTrack, clip.frames)
        const decision = decideCompare({
          clipKind: clip.kind,
          annotated: clip.annotated,
          detector,
          lite,
          full,
          landmarkError,
          angleDeltas,
        })
        const report: PoseCompareReport = {
          clip: {
            kind: clip.kind,
            name: clip.name,
            frames: clip.frames.length,
            width: clip.width,
            height: clip.height,
            annotated: clip.annotated,
          },
          detector,
          lite,
          full,
          landmarkError,
          angleDeltas,
          decision,
          aborted: false,
          generatedAt: new Date().toISOString(),
        }
        progress = {
          phase: 'done',
          model: null,
          frameIndex: clip.frames.length,
          frameCount: clip.frames.length,
          message: decision.verdict,
        }
        return report
      } catch (error) {
        if (born !== runGen) return abortedReport(clip, detector, lite, full)
        progress = {
          phase: 'error',
          model: progress.model,
          frameIndex: progress.frameIndex,
          frameCount: clip.frames.length,
          message: error instanceof Error ? error.message : 'Vergleich fehlgeschlagen.',
        }
        throw error
      }
    },
  }
}

function idleProgress(): PoseCompareProgress {
  return { phase: 'idle', model: null, frameIndex: 0, frameCount: 0, message: '' }
}

function abortedReport(
  clip: PoseCompareClip,
  detector: PoseCompareDetectorKind,
  lite: ReturnType<typeof emptyRunStats>,
  full: ReturnType<typeof emptyRunStats>,
): PoseCompareReport {
  const landmarkError = {
    liteVsFull: { rmseNorm: 0, rmsePx: 0, pairedFrames: 0 },
    vsTruth: { available: false, liteRmseNorm: null, fullRmseNorm: null, pairedFrames: 0, joints: [] },
  }
  const angleDeltas = {
    kneeFlexion: { meanAbsDeg: null, p95AbsDeg: null, n: 0 },
    trunkTorso: { meanAbsDeg: null, p95AbsDeg: null, n: 0 },
    elbowFlexion: { meanAbsDeg: null, p95AbsDeg: null, n: 0 },
  }
  return {
    clip: {
      kind: clip.kind,
      name: clip.name,
      frames: clip.frames.length,
      width: clip.width,
      height: clip.height,
      annotated: clip.annotated,
    },
    detector,
    lite,
    full,
    landmarkError,
    angleDeltas,
    decision: decideCompare({
      clipKind: clip.kind,
      annotated: clip.annotated,
      detector,
      lite,
      full,
      landmarkError,
      angleDeltas,
    }),
    aborted: true,
    generatedAt: new Date().toISOString(),
  }
}
