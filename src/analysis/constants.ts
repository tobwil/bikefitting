import { ANALYSIS_PIPELINE_VERSION, type AnalysisJobOptions } from '../types/analysis.ts'
import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'

/** Initial sampling target. Decoder must not invent missing original frames. */
export const ANALYSIS_TARGET_FPS = 30

/** Metrics `maxFrames: 900` is a live-pipeline cap. Offline jobs visit the whole clip. */
export const LIVE_METRICS_MAX_FRAMES = 900

/** Centered window used to judge pedaling periodicity. */
export const SEGMENT_WINDOW_MS = 2500

/** Cadence band for usable pedaling (40–180 rpm). Outside = mount/dismount/unsteady. */
export const PEDAL_PERIOD_MIN_MS = 333
export const PEDAL_PERIOD_MAX_MS = 1500

/** Normalized-image units per second. Pedaling ankle-hip is ~1.0; still is near 0. */
export const STILL_ANKLE_SPEED = 0.08
export const CAMERA_HIP_SPEED = 0.35

export const MIN_PEDAL_SPAN_MS = 2500
export const MIN_PERIODIC_CYCLES_IN_WINDOW = 2
export const MIN_WINDOW_SAMPLES = 8

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisJobOptions = {
  pipelineVersion: ANALYSIS_PIPELINE_VERSION,
  targetFps: ANALYSIS_TARGET_FPS,
  model: 'lite',
  minVisibility: MIN_LANDMARK_VISIBILITY,
  decoderKind: 'injected',
  frameAccurate: false,
}

export const ANALYSIS_LATENCY_TARGET = {
  medianMs: 60_000,
  p95Ms: 120_000,
  clip: '40s standard beginner clip at target 30 fps',
  hardware: 'Mac named in AP-09 — not measured in this package',
} as const
