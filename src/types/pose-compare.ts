import type { Landmark } from './landmarks.ts'
import type { PoseDetectResult } from './pose-engine.ts'
import type { PoseModelVariant } from './pose-engine.ts'

export type PoseCompareModelId = PoseModelVariant | 'heavy'

export type PoseCompareClipKind = 'synthetic' | 'file' | 'annotated'

export type PoseCompareDetectorKind = 'mediapipe' | 'injected'

export type PoseComparePixels = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type PoseCompareFrame = {
  timestampMs: number
  width: number
  height: number
  /** Optional pixel buffer so Lite and Full can each create a fresh bitmap. */
  pixels?: PoseComparePixels
  /** Ground-truth landmarks when the clip is synthetic or annotated. */
  truth?: Landmark[]
}

export type PoseCompareClip = {
  kind: PoseCompareClipKind
  name: string
  width: number
  height: number
  frames: PoseCompareFrame[]
  annotated: boolean
  localOnly: true
}

export type PercentileStats = {
  n: number
  mean: number
  p50: number
  p95: number
}

export type PoseModelRunStats = {
  model: PoseModelVariant
  versionPath: string
  packageVersion: string
  initMs: number
  inference: PercentileStats
  frames: number
  detectedFrames: number
  lostFrames: number
  missFrames: number
  timeoutFrames: number
  errorFrames: number
}

export type JointError = {
  joint: string
  rmseNorm: number
  n: number
}

export type LandmarkErrorReport = {
  /** Pairwise Lite vs Full on frames both detected. */
  liteVsFull: { rmseNorm: number; rmsePx: number; pairedFrames: number }
  /** Vs ground truth when the clip is annotated/synthetic. */
  vsTruth: {
    available: boolean
    liteRmseNorm: number | null
    fullRmseNorm: number | null
    pairedFrames: number
    joints: JointError[]
  }
}

export type AngleDeltaStats = {
  meanAbsDeg: number | null
  p95AbsDeg: number | null
  n: number
}

export type AngleDeltaReport = {
  kneeFlexion: AngleDeltaStats
  trunkTorso: AngleDeltaStats
  elbowFlexion: AngleDeltaStats
}

export type PoseCompareVerdict = 'keep_lite' | 'full_eligible' | 'inconclusive'

export type PoseCompareDecision = {
  verdict: PoseCompareVerdict
  /** Product default stays Lite unless this is true *and* a reviewer promotes. */
  promoteFull: false
  applyFullToProduct: false
  loadHeavy: false
  reason: string
  accuracyNote: string
  runtimeNote: string
}

export type PoseCompareProgress = {
  phase: 'idle' | 'loading' | 'running' | 'aborting' | 'done' | 'error'
  model: PoseModelVariant | null
  frameIndex: number
  frameCount: number
  message: string
}

export type PoseCompareReport = {
  clip: {
    kind: PoseCompareClipKind
    name: string
    frames: number
    width: number
    height: number
    annotated: boolean
  }
  detector: PoseCompareDetectorKind
  lite: PoseModelRunStats
  full: PoseModelRunStats
  landmarkError: LandmarkErrorReport
  angleDeltas: AngleDeltaReport
  decision: PoseCompareDecision
  aborted: boolean
  generatedAt: string
}

export type PoseCompareDetectFn = (
  model: PoseModelVariant,
  frame: PoseCompareFrame,
) => Promise<PoseDetectResult>

export type PoseCompareLoadFn = (model: PoseModelVariant) => Promise<{ initMs: number }>
