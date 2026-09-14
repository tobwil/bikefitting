import type { AnalysisJob, MarkerlessReport } from '../types/analysis.ts'
import { MARKERLESS_KNEE_METHOD, MARKERLESS_KNEE_METHOD_VERSION } from '../types/analysis.ts'
import type { CaptureAsset } from '../types/capture.ts'
import {
  OBSERVATION_KIND,
  OBSERVATION_SCHEMA_VERSION,
  type ObservationMetric,
  type ObservationReport,
  type ObservationStatus,
} from '../types/observation.ts'
import { qualityNotesFromMarkerless } from '../analysis/quality.ts'

function kneeMetricFromReport(report: MarkerlessReport): ObservationMetric {
  const available = report.knee.quality === 'ok' && report.knee.degrees != null
  return {
    id: 'knee_flexion',
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: report.methodVersion,
    value: available ? report.knee.degrees!.median : null,
    unit: 'deg',
    usableCycles: report.knee.usableCycles,
    spread: available ? (report.knee.degrees!.spread ?? null) : null,
    available,
    reasons: [...report.knee.reasons],
    evidenceIds: report.evidence.map((item) => item.id),
  }
}

function statusFromReport(report: MarkerlessReport): ObservationStatus {
  if (report.knee.quality === 'ok' && report.knee.degrees != null) return 'usable'
  return 'retake'
}

export function observationFromMarkerlessReport(input: {
  captureId: string
  analysisId: string
  inputHash: string | null
  geometryRevision: number | null
  durationMs: number
  report: MarkerlessReport
  completedAt?: string
}): ObservationReport {
  const knee = kneeMetricFromReport(input.report)
  const status = statusFromReport(input.report)
  const notes = qualityNotesFromMarkerless(input.report)
  const reasons =
    status === 'usable' ? [] : knee.reasons.length > 0 ? [...knee.reasons] : ['missing_knee']
  return {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId: input.captureId,
    analysisId: input.analysisId,
    jobId: input.analysisId,
    inputHash: input.inputHash,
    pipelineVersion: input.report.pipelineVersion,
    status,
    reasons,
    reasonText:
      notes[0] ??
      (status === 'usable'
        ? 'Kniebeugung nahe größter Streckung aus den nutzbaren Tretzyklen. Keine Satteländerung aus dieser Methode.'
        : 'Kniebeugung nahe größter Streckung nicht auswertbar. Keine Sitzeinstellung.'),
    method: MARKERLESS_KNEE_METHOD,
    methodVersion: input.report.methodVersion,
    phaseSource: input.report.phaseSource,
    side: input.report.knee.side,
    mediaStartMs: input.report.selectedSegment?.startMs ?? 0,
    mediaEndMs: input.report.selectedSegment?.endMs ?? input.durationMs,
    geometryRevision: input.geometryRevision,
    metrics: [knee],
    evidence: input.report.evidence.map((item) => ({
      id: item.id,
      mediaTimeMs: item.mediaTimeMs,
      caption: item.label,
    })),
    stub: false,
    completedAt: input.completedAt ?? new Date().toISOString(),
  }
}

/**
 * Map a finished AP-03 job (with AP-05 `measure()` observation) to the AP-06 report.
 * Never aliases max_extension as BDC. Failed jobs stay failed, not a soothing usable knee.
 */
export function observationFromAnalysisJob(input: {
  asset: Pick<CaptureAsset, 'captureId' | 'contentHash' | 'durationMs'>
  job: AnalysisJob
}): ObservationReport {
  const completedAt = new Date(input.job.finishedAtMs ?? Date.now()).toISOString()
  if (input.job.phase === 'failed' || input.job.phase === 'cancelled') {
    return {
      kind: OBSERVATION_KIND,
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      captureId: input.asset.captureId,
      analysisId: input.job.jobId,
      jobId: input.job.jobId,
      inputHash: input.job.inputHash,
      pipelineVersion: input.job.pipelineVersion,
      status: 'failed',
      reasons: ['analysis_failed', input.job.error?.code ?? 'unknown'],
      reasonText:
        input.job.error?.message ??
        'Die Auswertung ist fehlgeschlagen. Dieselbe gespeicherte Aufnahme erneut auswerten — nicht neu filmen.',
      method: MARKERLESS_KNEE_METHOD,
      methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
      phaseSource: 'unavailable',
      side: null,
      mediaStartMs: 0,
      mediaEndMs: input.asset.durationMs,
      geometryRevision: input.job.geometryRevision,
      metrics: [
        {
          id: 'knee_flexion',
          method: MARKERLESS_KNEE_METHOD,
          methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
          value: null,
          unit: 'deg',
          usableCycles: 0,
          spread: null,
          available: false,
          reasons: ['analysis_failed'],
          evidenceIds: [`capture:${input.asset.captureId}`],
        },
      ],
      evidence: [{ id: `capture:${input.asset.captureId}` }],
      stub: false,
      completedAt,
    }
  }

  const report = input.job.metrics?.observation
  if (!report) {
    const reasons = input.job.metrics?.reasons.length
      ? [...input.job.metrics.reasons]
      : ['segment_unusable']
    return {
      kind: OBSERVATION_KIND,
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      captureId: input.asset.captureId,
      analysisId: input.job.jobId,
      jobId: input.job.jobId,
      inputHash: input.job.inputHash,
      pipelineVersion: input.job.pipelineVersion,
      status: 'retake',
      reasons,
      reasonText:
        'Kein durchgehendes Treten mit auswertbarer Kniekette. Stillstand, Auf- oder Absteigen zählen nicht. Keine Sitzeinstellung.',
      method: MARKERLESS_KNEE_METHOD,
      methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
      phaseSource: 'unavailable',
      side: input.job.selected?.side ?? null,
      mediaStartMs: input.job.selected?.startMs ?? 0,
      mediaEndMs: input.job.selected?.endMs ?? input.asset.durationMs,
      geometryRevision: input.job.geometryRevision,
      metrics: [
        {
          id: 'knee_flexion',
          method: MARKERLESS_KNEE_METHOD,
          methodVersion: MARKERLESS_KNEE_METHOD_VERSION,
          value: null,
          unit: 'deg',
          usableCycles: input.job.metrics?.usableCycles ?? 0,
          spread: null,
          available: false,
          reasons,
          evidenceIds: [`capture:${input.asset.captureId}`],
        },
      ],
      evidence: [{ id: `capture:${input.asset.captureId}` }],
      stub: false,
      completedAt,
    }
  }

  return observationFromMarkerlessReport({
    captureId: input.job.captureId,
    analysisId: input.job.jobId,
    inputHash: input.job.inputHash,
    geometryRevision: input.job.geometryRevision,
    durationMs: input.asset.durationMs,
    report,
    completedAt,
  })
}
