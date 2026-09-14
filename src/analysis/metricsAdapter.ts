import type { PoseFrame } from '../types/landmarks.ts'
import type {
  AnalysisMetricsRequest,
  AnalysisMetricsResponse,
  AnalysisPoseSample,
  MarkerlessReport,
} from '../types/analysis.ts'
import {
  MARKERLESS_KNEE_METHOD,
  MARKERLESS_KNEE_METHOD_VERSION,
  MARKERLESS_PIPELINE_VERSION,
} from '../types/analysis.ts'
import { observeKneeFromPoses } from './fromClip.ts'

/**
 * AP-03 ↔ AP-05 interface.
 *
 * AP-03 produces `AnalysisMetricsRequest` after decode / pose / segment.
 * AP-05 implements `measure` via `observeKneeFromPoses` and returns a versioned
 * `max_extension.p10.v1` observation. Media time on pose samples is required
 * (inference timestamps are not a substitute).
 *
 * Merge rules:
 * - Do not require pedal markers, B/S/G, or `MetricsFrame.pedal`.
 * - Do not silently trim `request.samples` with live `maxFrames: 900`.
 * - Do not emit ActionDecision `adjust` from this adapter (AP-10 release gate).
 * - Register by passing `{ metrics }` into `createAnalysisController`.
 */
export type AnalysisMetricsAdapter = {
  id: string
  version: string
  measure(request: AnalysisMetricsRequest): Promise<AnalysisMetricsResponse>
}

export const PENDING_AP05_ADAPTER: AnalysisMetricsAdapter = {
  id: 'ap05.pending',
  version: '0',
  async measure(request) {
    const reasons = ['ap05_not_wired']
    if (!request.selected) reasons.unshift('no_usable_pedaling')
    return {
      adapterId: this.id,
      adapterVersion: this.version,
      status: 'not_implemented',
      observation: null,
      usableCycles: null,
      reasons,
    }
  },
}

function posesAtMediaTime(samples: readonly AnalysisPoseSample[]): PoseFrame[] {
  const frames: PoseFrame[] = []
  for (const sample of samples) {
    if (!sample.pose) continue
    const nearSide = sample.pose.nearSide ?? sample.side
    frames.push({
      ...sample.pose,
      timestampMs: sample.mediaTimeMs,
      ...(nearSide ? { nearSide } : {}),
    })
  }
  return frames
}

function responseFromReport(
  adapter: Pick<AnalysisMetricsAdapter, 'id' | 'version'>,
  report: MarkerlessReport,
  extraReasons: string[] = [],
): AnalysisMetricsResponse {
  const ok = report.knee.quality === 'ok' && report.knee.degrees != null
  return {
    adapterId: adapter.id,
    adapterVersion: adapter.version,
    status: ok ? 'ok' : 'unavailable',
    observation: report,
    usableCycles: report.knee.usableCycles,
    reasons: extraReasons.length ? [...extraReasons, ...report.knee.reasons] : [...report.knee.reasons],
  }
}

/**
 * Default product adapter: AP-03 `measure()` → AP-05 `observeKneeFromPoses`.
 * Observation method is always `max_extension`, never BDC.
 */
export const MARKERLESS_AP05_ADAPTER: AnalysisMetricsAdapter = {
  id: 'ap05.markerless',
  version: MARKERLESS_KNEE_METHOD_VERSION,
  async measure(request) {
    if (!request.selected) {
      return {
        adapterId: this.id,
        adapterVersion: this.version,
        status: 'unavailable',
        observation: null,
        usableCycles: 0,
        reasons: ['no_usable_pedaling', MARKERLESS_KNEE_METHOD],
      }
    }
    const frames = posesAtMediaTime(request.samples)
    if (frames.length === 0) {
      return {
        adapterId: this.id,
        adapterVersion: this.version,
        status: 'unavailable',
        observation: null,
        usableCycles: 0,
        reasons: ['missing_knee', MARKERLESS_KNEE_METHOD],
      }
    }
    const report = observeKneeFromPoses(frames, { minVisibility: request.options.minVisibility })
    return responseFromReport(this, report, [MARKERLESS_PIPELINE_VERSION])
  },
}
