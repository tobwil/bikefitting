import type { CameraNearSide, Landmark, PoseEngineId } from './landmarks.ts'
import type { PixelPoint } from './calibration.ts'
import type { MetricMethod } from './metrics.ts'
import type { ResultSource } from './result.ts'

/** Crank-phase stills frozen onto a result. Bump if the payload shape changes. */
export const PHASE_EVIDENCE_SCHEMA_VERSION = 1

/**
 * How the still was chosen. BikeFit uses measured crank angle (pedal lock).
 * Knee extrema / toe-x heuristics are not a phase detector.
 */
export const PHASE_SELECTION_METHOD = 'crank_angle' as const
export type PhaseSelectionMethod = typeof PHASE_SELECTION_METHOD

export const PHASE_IDS = ['tdc', 'forward', 'bdc', 'back'] as const
export type PhaseId = (typeof PHASE_IDS)[number]

/** 0° = TDC, +deg toward bike +X. Same convention as `pedal/geometry.crankAngleDeg`. */
export const PHASE_TARGET_DEG: Record<PhaseId, number> = {
  tdc: 0,
  forward: 90,
  bdc: 180,
  back: 270,
}

export const PHASE_SLOT_STATUSES = ['captured', 'missing', 'deleted'] as const
export type PhaseSlotStatus = (typeof PHASE_SLOT_STATUSES)[number]

/** Inclusive half-width in crank space. Same default as the BDC metric window. */
export const PHASE_WINDOW_HALF_DEG = 12

export type PhaseMarks = {
  B: PixelPoint | null
  S: PixelPoint | null
  G: PixelPoint | null
}

/** Pose snapshot frozen with the still — enough to redraw overlay without live calib. */
export type PhasePoseSnapshot = {
  timestampMs: number
  videoWidth: number
  videoHeight: number
  nearSide: CameraNearSide | null
  engine: PoseEngineId
  landmarks: Landmark[]
}

export type PhaseFrameMetrics = {
  kneeFlexionDeg: number | null
  trunkTorsoDeg: number | null
  elbowDeg: number | null
}

export type PhaseImage = {
  mime: 'image/jpeg'
  /** Local data URL. Never uploaded. */
  dataUrl: string
}

/**
 * One still from a real recording frame at a target crank phase.
 * `frameIndex` / `timestampMs` must match the metrics frame that produced it.
 */
export type PhaseFrameEvidence = {
  frameIndex: number
  timestampMs: number
  capturedAt: string
  crankAngleDeg: number
  phase01: number
  cycleIndex: number
  nearSide: CameraNearSide
  marks: PhaseMarks
  pose: PhasePoseSnapshot | null
  /** Single-frame angles at this crank position — not the multi-cycle aggregate. */
  frameMetrics: PhaseFrameMetrics
  image: PhaseImage | null
}

export type PhaseSlot = {
  id: PhaseId
  targetDeg: number
  status: PhaseSlotStatus
  /** Closest in-window sample. Null when missing or after image delete (metadata may remain). */
  frame: PhaseFrameEvidence | null
}

export type PhaseRepresentativeCycle = {
  index: number
  startIndex: number
  endIndex: number
  startMs: number
  endMs: number
}

export type PhaseEvidence = {
  schemaVersion: typeof PHASE_EVIDENCE_SCHEMA_VERSION
  /** False after the user deletes stored stills. Metadata may remain. */
  stored: boolean
  selectionMethod: PhaseSelectionMethod
  /** Copied from the primary knee card so before/after can require the same metric method. */
  metricMethod: MetricMethod
  windowHalfDeg: number
  side: CameraNearSide
  source: ResultSource
  representativeCycle: PhaseRepresentativeCycle | null
  calibrationVersion: number
  setupId: string | null
  capturedAt: string
  slots: PhaseSlot[]
}
