import { sha256Hex } from '../capture/hash.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type {
  MarkerlessJobInput,
  MarkerlessJobResult,
  MarkerlessReport,
} from '../types/analysis.ts'
import {
  ANALYSIS_JOB_KIND,
  ANALYSIS_JOB_SCHEMA_VERSION,
  MARKERLESS_KNEE_METHOD,
  MARKERLESS_KNEE_METHOD_VERSION,
  MARKERLESS_PIPELINE_VERSION,
  POSE_REPLAY_CLIP_KIND,
  POSE_REPLAY_CLIP_SCHEMA_VERSION,
} from '../types/analysis.ts'
import { resolveMarkerlessOptions, type MarkerlessOptions } from './constants.ts'
import { motionEvidenceFromReport } from './evidence.ts'
import { measureMaxExtension } from './kneeObservation.ts'
import { detectMotionCycles } from './motionCycles.ts'
import { qualityLevelFromKnee, qualityNotesFromMarkerless } from './quality.ts'
import { replayPoseOverClip } from './replay.ts'

function emptyReport(
  frames: number,
  extras: Partial<MarkerlessReport> = {},
): MarkerlessReport {
  const report: MarkerlessReport = {
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
    pipelineVersion: MARKERLESS_PIPELINE_VERSION,
    phaseSource: 'unavailable',
    frames,
    candidateCycles: 0,
    usableCycles: 0,
    selectedSegment: null,
    excludedSegments: [],
    cycles: [],
    knee: {
      id: 'kneeFlexion',
      method: MARKERLESS_KNEE_METHOD,
      methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
      unit: 'deg',
      quality: 'unavailable',
      reasons: extras.knee?.reasons ?? ['empty_clip'],
      degrees: null,
      usableCycles: 0,
      side: null,
      phaseSource: 'unavailable',
    },
    evidence: [],
    qualityLevel: 'insufficient',
    qualityNotes: [],
    ...extras,
  }
  report.qualityNotes = qualityNotesFromMarkerless(report)
  return report
}

/**
 * Markerless knee observation from already-replayed pose samples (AP-03 output or fixture).
 * Does not read pedal markers, B/S/G, or scale.
 */
export function observeKneeFromPoses(
  frames: readonly PoseFrame[],
  options?: Partial<MarkerlessOptions>,
): MarkerlessReport {
  const opts = resolveMarkerlessOptions(options)
  if (frames.length === 0) return emptyReport(0)

  const replay = replayPoseOverClip(frames, opts)
  const motion = detectMotionCycles(replay.samples, opts, replay.sideSwitch)

  if (!motion.selected) {
    const reasons = motion.excluded.some((seg) => seg.reason === 'mount_dismount')
      ? (['mount_dismount', 'not_pedaling'] as const)
      : motion.excluded.some((seg) => seg.reason === 'still')
        ? (['still', 'not_pedaling'] as const)
        : (['not_pedaling'] as const)
    const report = emptyReport(replay.samples.length, {
      excludedSegments: motion.excluded,
      knee: {
        id: 'kneeFlexion',
        method: MARKERLESS_KNEE_METHOD,
        methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
        unit: 'deg',
        quality: 'unavailable',
        reasons: [...reasons],
        degrees: null,
        usableCycles: 0,
        side: replay.lockedSide,
        phaseSource: 'unavailable',
      },
    })
    return report
  }

  const measured = measureMaxExtension(replay.samples, motion.cycles, opts, replay.lockedSide)
  const report: MarkerlessReport = {
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
    pipelineVersion: MARKERLESS_PIPELINE_VERSION,
    phaseSource: measured.knee.phaseSource,
    frames: replay.samples.length,
    candidateCycles: measured.cycles.length,
    usableCycles: measured.knee.usableCycles,
    selectedSegment: motion.selected,
    excludedSegments: motion.excluded,
    cycles: measured.cycles,
    knee: measured.knee,
    evidence: [],
    qualityLevel: qualityLevelFromKnee(
      measured.knee.quality === 'ok',
      measured.knee.usableCycles,
      opts.minValidCycles,
    ),
    qualityNotes: [],
  }
  report.evidence = motionEvidenceFromReport({ samples: replay.samples, report })
  report.qualityNotes = qualityNotesFromMarkerless(report)
  return report
}

export function isPoseReplayClipBytes(bytes: Uint8Array): boolean {
  try {
    const parsed = decodePoseReplayClip(bytes)
    return parsed != null
  } catch {
    return false
  }
}

export function decodePoseReplayClip(bytes: Uint8Array): { clipId: string; captureId: string; frames: PoseFrame[] } | null {
  const text = new TextDecoder().decode(bytes)
  if (!text.includes(POSE_REPLAY_CLIP_KIND)) return null
  const value = JSON.parse(text) as {
    kind?: string
    schemaVersion?: number
    clipId?: string
    captureId?: string
    frames?: PoseFrame[]
  }
  if (value.kind !== POSE_REPLAY_CLIP_KIND) return null
  if (value.schemaVersion !== POSE_REPLAY_CLIP_SCHEMA_VERSION) return null
  if (typeof value.clipId !== 'string' || typeof value.captureId !== 'string') return null
  if (!Array.isArray(value.frames) || value.frames.length === 0) return null
  return { clipId: value.clipId, captureId: value.captureId, frames: value.frames }
}

export function encodePoseReplayClip(input: {
  clipId: string
  captureId: string
  fps: number
  width: number
  height: number
  frames: readonly PoseFrame[]
}): Uint8Array {
  const body = JSON.stringify({
    kind: POSE_REPLAY_CLIP_KIND,
    schemaVersion: POSE_REPLAY_CLIP_SCHEMA_VERSION,
    clipId: input.clipId,
    captureId: input.captureId,
    fps: input.fps,
    width: input.width,
    height: input.height,
    frames: input.frames,
  })
  return new TextEncoder().encode(body)
}

/**
 * AP-03 entry: consume clipId + bytes (+ optional poseFrames) → markerless report.
 * Real WebM/MP4 without poseFrames returns `decoder_required` (AP-03 decode + pose).
 */
export async function runMarkerlessJob(
  input: MarkerlessJobInput,
  options?: Partial<MarkerlessOptions>,
): Promise<MarkerlessJobResult> {
  const copy = new Uint8Array(input.bytes.byteLength)
  copy.set(input.bytes)
  const inputHash = await sha256Hex(copy.buffer as ArrayBuffer)
  const job = {
    kind: ANALYSIS_JOB_KIND,
    schemaVersion: ANALYSIS_JOB_SCHEMA_VERSION,
    jobId: input.jobId,
    captureId: input.captureId,
    clipId: input.clipId,
    inputHash,
    pipelineVersion: MARKERLESS_PIPELINE_VERSION,
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
  } as const

  let frames = input.poseFrames ? [...input.poseFrames] : null
  if (!frames) {
    const decoded = decodePoseReplayClip(input.bytes)
    if (decoded) frames = decoded.frames
  }

  if (!frames) {
    return {
      job,
      state: 'failed',
      report: null,
      failReason: input.bytes.byteLength === 0 ? 'empty_clip' : 'decoder_required',
    }
  }

  const report = observeKneeFromPoses(frames, options)
  return {
    job,
    state: 'done',
    report,
    failReason: null,
  }
}
