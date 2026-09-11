import type { PixelPoint } from './calibration.ts'

/** P0 implements `current_setup` only. `adjustment_simulation` is P1. */
export type SollMode = 'current_setup' | 'adjustment_simulation'

export type SollSolverStatus = 'feasible' | 'infeasible' | 'insufficient_input' | 'timeout'

export type SollPhaseSource = 'pedal' | 'synthetic'

export type SollReasonCode =
  | 'not_started'
  | 'mode_unsupported'
  | 'missing_marks'
  | 'missing_transform'
  | 'missing_phase'
  | 'phase_lost'
  | 'missing_segments'
  | 'leg_unreachable'
  | 'arm_unreachable'
  | 'length_violation'
  | 'timeout'

export type SollReason = {
  code: SollReasonCode
  message: string
}

export type BodySegmentId = 'thigh' | 'shank' | 'foot' | 'torso' | 'upperArm' | 'forearm' | 'head'

export type LengthSource = 'measured' | 'estimated'

export type BodySegmentLength = {
  id: BodySegmentId
  lengthPx: number
  source: LengthSource
}

/**
 * Hip target relative to saddle S, in bike coordinates (x forward, y up).
 * The solver may place the hip anywhere inside the tolerance box — it must not move S.
 */
export type HipOffset = {
  x: number
  y: number
  tolX: number
  tolY: number
  source: LengthSource
}

export type CrankLength = {
  lengthPx: number
  source: LengthSource
}

export type BodyModel = {
  segments: BodySegmentLength[]
  hipOffset: HipOffset
  crank: CrankLength
}

export type SollJointId =
  | 'head'
  | 'shoulder'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'knee'
  | 'ankle'
  | 'heel'
  | 'footIndex'

export type SollSkeleton = {
  joints: Record<SollJointId, PixelPoint>
  chains: Array<readonly SollJointId[]>
}

export type SollHipRegionPx = {
  x: number
  y: number
  w: number
  h: number
}

export type SollCrankCircle = {
  center: PixelPoint
  radius: number
}

export type SollSolveResult = {
  status: SollSolverStatus
  reasons: SollReason[]
  mode: SollMode
  skeleton: SollSkeleton | null
  hipRegion: SollHipRegionPx | null
  crankCircle: SollCrankCircle | null
  phase01: number | null
  phaseSource: SollPhaseSource
  crankRadiusPx: number | null
  elapsedMs: number
  usedEstimatedLengths: boolean
}

export type SollUiState = {
  mode: SollMode
  showGhost: boolean
  showCorridor: boolean
  phaseSource: SollPhaseSource
  syntheticPhase01: number
  syntheticPlaying: boolean
  limbScale: number
}

export const SOLL_INFEASIBLE_COPY = 'Zielbereich mit diesem Setup nicht erreichbar'

export const SOLL_CHAINS: Array<readonly SollJointId[]> = [
  ['head', 'shoulder', 'hip', 'knee', 'ankle'],
  ['shoulder', 'elbow', 'wrist'],
  ['heel', 'ankle', 'footIndex'],
]

export const SOLL_SEGMENT_ORDER: BodySegmentId[] = [
  'thigh',
  'shank',
  'foot',
  'torso',
  'upperArm',
  'forearm',
  'head',
]
