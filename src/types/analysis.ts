/**
 * AP-03 ↔ AP-05 ↔ AP-06 contract for markerless analysis of a saved local clip.
 *
 * AP-03 owns video decode + pose on original MediaRecorder/import bytes.
 * AP-05 owns motion-cycle selection and the `max_extension` knee observation.
 * AP-06 consumes the report, evidence refs, and ActionDecision quality fields.
 *
 * This is not the v1 `MeasurementResult` and not a BDC crank-phase report.
 */

import type { CameraNearSide, PoseFrame } from './landmarks.ts'
import type { MetricQuality, MetricResult, MetricStats, MetricUnavailableReason, MetricsReport } from './metrics.ts'
import type { QualityLevel } from './result.ts'

export const ANALYSIS_JOB_KIND = 'bikefit.analysis-job' as const
export const ANALYSIS_JOB_SCHEMA_VERSION = 1 as const

export const MARKERLESS_KNEE_METHOD = 'max_extension' as const
/** 10th percentile of valid raw knee flexions per motion cycle, then median across cycles. */
export const MARKERLESS_KNEE_METHOD_VERSION = 'max_extension.p10.v1' as const
export const MARKERLESS_PIPELINE_VERSION = 'ap05.markerless.v1' as const

export const MARKERLESS_PHASE_SOURCE = 'motion_estimate' as const
export type MarkerlessPhaseSource = typeof MARKERLESS_PHASE_SOURCE | 'unavailable'

export const ANALYSIS_JOB_STATES = [
  'queued',
  'decoding',
  'pose',
  'selecting_segment',
  'measuring',
  'done',
  'cancelled',
  'failed',
] as const
export type AnalysisJobState = (typeof ANALYSIS_JOB_STATES)[number]

export const POSE_REPLAY_CLIP_KIND = 'bikefit.pose-replay-clip' as const
export const POSE_REPLAY_CLIP_SCHEMA_VERSION = 1 as const

export const MARKERLESS_REASONS = [
  'missing_knee',
  'too_few_cycles',
  'not_pedaling',
  'still',
  'mount_dismount',
  'side_switch',
  'insufficient_extension_coverage',
  'unrealistic_jump',
  'visibility',
  'decoder_required',
  'empty_clip',
] as const
export type MarkerlessReason = (typeof MARKERLESS_REASONS)[number]

export const MOTION_EVIDENCE_KIND = 'motion_state' as const
export const MOTION_EVIDENCE_LABELS = [
  'near_max_extension',
  'cycle_start',
  'cycle_end',
  'segment_start',
  'segment_end',
] as const
export type MotionEvidenceLabel = (typeof MOTION_EVIDENCE_LABELS)[number]

/**
 * Frame/time hook for AP-06. Never a crank-phase id (`bdc` / `tdc`).
 * `phaseSource` is `motion_estimate` — not a verified BDC still.
 */
export type MotionEvidenceRef = {
  id: string
  kind: typeof MOTION_EVIDENCE_KIND
  phaseSource: typeof MARKERLESS_PHASE_SOURCE
  label: MotionEvidenceLabel
  cycleIndex: number | null
  frameIndex: number
  mediaTimeMs: number
  side: CameraNearSide
}

export type AnalysisJobRef = {
  kind: typeof ANALYSIS_JOB_KIND
  schemaVersion: typeof ANALYSIS_JOB_SCHEMA_VERSION
  jobId: string
  captureId: string
  clipId: string
  inputHash: string
  pipelineVersion: string
  method: typeof MARKERLESS_KNEE_METHOD
  methodVersion: typeof MARKERLESS_KNEE_METHOD_VERSION
}

/**
 * AP-03 (or a fixture) feeds this. `bytes` are the saved clip identity.
 * Real WebM/MP4 decode is AP-03: pass `poseFrames` after local pose replay.
 * AP-05 can decode only the in-repo `bikefit.pose-replay-clip` fixture.
 */
export type MarkerlessJobInput = {
  jobId: string
  captureId: string
  clipId: string
  bytes: Uint8Array
  mimeType?: string | null
  /** Pose samples in media time. Required for real MediaRecorder bytes until AP-03 decodes. */
  poseFrames?: readonly PoseFrame[]
}

export type MarkerlessSegment = {
  startMs: number
  endMs: number
  startIndex: number
  endIndex: number
  reason: 'pedaling' | 'still' | 'mount_dismount' | 'gap'
}

export type MarkerlessCycle = {
  index: number
  startIndex: number
  endIndex: number
  startMs: number
  endMs: number
  valid: boolean
  reasons: MarkerlessReason[]
  /** Per-cycle 10th percentile of valid raw flexion. Null when the cycle is excluded. */
  p10FlexionDeg: number | null
  /** Exact sample minimum — diagnostic only, not the reported metric. */
  rawMinFlexionDeg: number | null
  extensionFrameIndex: number | null
  extensionMediaTimeMs: number | null
}

export type MarkerlessKneeMetric = {
  id: 'kneeFlexion'
  method: typeof MARKERLESS_KNEE_METHOD
  methodVersion: typeof MARKERLESS_KNEE_METHOD_VERSION
  unit: 'deg'
  quality: MetricQuality
  reasons: MarkerlessReason[]
  degrees: MetricStats | null
  usableCycles: number
  side: CameraNearSide | null
  phaseSource: MarkerlessPhaseSource
}

/**
 * MetricsReport-like output for AP-03/AP-06.
 * `metrics.kneeFlexion.method` is always `max_extension` — never renamed to BDC.
 * Trunk/elbow are out of scope for AP-05 (own gates later).
 */
export type MarkerlessReport = {
  method: typeof MARKERLESS_KNEE_METHOD
  methodVersion: typeof MARKERLESS_KNEE_METHOD_VERSION
  pipelineVersion: typeof MARKERLESS_PIPELINE_VERSION
  phaseSource: MarkerlessPhaseSource
  frames: number
  candidateCycles: number
  usableCycles: number
  selectedSegment: MarkerlessSegment | null
  excludedSegments: MarkerlessSegment[]
  cycles: MarkerlessCycle[]
  knee: MarkerlessKneeMetric
  evidence: MotionEvidenceRef[]
  /** Mapped for ActionDecision. `insufficient` when the core knee metric is missing. */
  qualityLevel: QualityLevel
  qualityNotes: string[]
}

export type MarkerlessJobResult = {
  job: AnalysisJobRef
  state: AnalysisJobState
  report: MarkerlessReport | null
  /** Present when AP-03 must decode real media; fixture clips do not need it. */
  failReason: MarkerlessReason | null
}

/** AP-03 may treat this as MetricsReport. Other metrics stay unavailable — not invented. */
export function markerlessToMetricsReport(report: MarkerlessReport): MetricsReport {
  const knee: MetricResult = {
    id: 'kneeFlexion',
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: report.methodVersion,
    unit: 'deg',
    quality: report.knee.quality,
    reasons: toMetricReasons(report.knee.reasons),
    degrees: report.knee.degrees,
    usableCycles: report.knee.usableCycles,
  }
  const unused = (id: MetricResult['id']): MetricResult => ({
    id,
    method: id === 'kneeFlexion' ? MARKERLESS_KNEE_METHOD : 'cycle_mean',
    unit: 'deg',
    quality: 'unavailable',
    reasons: ['too_few_cycles'],
    degrees: null,
    usableCycles: 0,
  })
  return {
    validRevolutions: report.usableCycles,
    candidateCycles: report.candidateCycles,
    frames: report.frames,
    cycles: report.cycles.map((cycle) => ({
      index: cycle.index,
      startIndex: cycle.startIndex,
      endIndex: cycle.endIndex,
      startMs: cycle.startMs,
      endMs: cycle.endMs,
      valid: cycle.valid,
      reasons: toMetricReasons(cycle.reasons),
    })),
    tracking: {
      quality: report.usableCycles > 0 ? 'ok' : 'unavailable',
      validRevolutions: report.usableCycles,
      candidateCycles: report.candidateCycles,
      lostFrames: 0,
      reasons: report.knee.quality === 'ok' ? [] : toMetricReasons(report.knee.reasons),
    },
    metrics: {
      kneeFlexion: knee,
      kneeFlexionCycleMean: unused('kneeFlexionCycleMean'),
      trunkTorso: unused('trunkTorso'),
      elbow: unused('elbow'),
    },
  }
}

function toMetricReasons(reasons: readonly MarkerlessReason[]): MetricUnavailableReason[] {
  const out: MetricUnavailableReason[] = []
  for (const reason of reasons) {
    if (reason === 'visibility' || reason === 'missing_knee' || reason === 'insufficient_extension_coverage') {
      out.push('visibility')
    } else if (reason === 'unrealistic_jump' || reason === 'side_switch') {
      out.push('phase_loss')
    } else {
      out.push('too_few_cycles')
    }
  }
  return [...new Set(out)]
}
