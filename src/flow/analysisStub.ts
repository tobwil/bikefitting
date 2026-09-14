import type { CaptureAsset } from '../types/capture.ts'
import {
  OBSERVATION_KIND,
  OBSERVATION_SCHEMA_VERSION,
  type ObservationMetric,
  type ObservationReport,
} from '../types/observation.ts'
export const ANALYSIS_STUB_PIPELINE = 'analysis.stub.v1'

export function newAnalysisId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

const KNEE_UNAVAILABLE: ObservationMetric = {
  id: 'knee_flexion',
  method: null,
  methodVersion: null,
  value: null,
  unit: 'deg',
  usableCycles: 0,
  spread: null,
  available: false,
  reasons: ['method_not_available'],
  evidenceIds: [],
}

export type StubAnalyzeInput = {
  asset: Pick<CaptureAsset, 'captureId' | 'contentHash' | 'completeness' | 'durationMs' | 'createdAt'>
  analysisId?: string
  completedAt?: string
  failure?: { code: string; message: string }
}

/**
 * Honest placeholder until AP-05 (and AP-03 job) land.
 * Never invents a usable knee value or a BDC phase.
 */
export function stubAnalyzeCapture(input: StubAnalyzeInput): ObservationReport {
  const analysisId = input.analysisId ?? newAnalysisId()
  const completedAt = input.completedAt ?? new Date().toISOString()
  const captureId = input.asset.captureId
  const evidence = [{ id: `capture:${captureId}` }]

  if (input.asset.completeness !== 'complete') {
    return {
      kind: OBSERVATION_KIND,
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      captureId,
      analysisId,
      jobId: analysisId,
      inputHash: input.asset.contentHash,
      pipelineVersion: ANALYSIS_STUB_PIPELINE,
      status: 'retake',
      reasons: ['capture_incomplete', 'analysis_stub'],
      reasonText:
        'Der Clip ist unvollständig (zu kurz oder nicht vollständig gespeichert). Er gilt nicht als ausgewertetes Ergebnis.',
      method: null,
      methodVersion: null,
      phaseSource: 'unavailable',
      side: null,
      mediaStartMs: 0,
      mediaEndMs: input.asset.durationMs,
      geometryRevision: null,
      metrics: [{ ...KNEE_UNAVAILABLE, reasons: ['capture_incomplete', 'method_not_available'] }],
      evidence,
      stub: true,
      completedAt,
    }
  }

  if (input.failure) {
    return {
      kind: OBSERVATION_KIND,
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      captureId,
      analysisId,
      jobId: analysisId,
      inputHash: input.asset.contentHash,
      pipelineVersion: ANALYSIS_STUB_PIPELINE,
      status: 'failed',
      reasons: ['analysis_failed', input.failure.code, 'analysis_stub'],
      reasonText: input.failure.message,
      method: null,
      methodVersion: null,
      phaseSource: 'unavailable',
      side: null,
      mediaStartMs: 0,
      mediaEndMs: input.asset.durationMs,
      geometryRevision: null,
      metrics: [{ ...KNEE_UNAVAILABLE, reasons: ['analysis_failed', 'method_not_available'] }],
      evidence,
      stub: true,
      completedAt,
    }
  }

  return {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId,
    analysisId,
    jobId: analysisId,
    inputHash: input.asset.contentHash,
    pipelineVersion: ANALYSIS_STUB_PIPELINE,
    status: 'incomplete',
    reasons: ['analysis_stub', 'method_not_available'],
    reasonText:
      'Die markerfreie Knieauswertung (max_extension) ist in dieser Version noch nicht eingebaut. Der Clip bleibt gespeichert. Es gibt keine erfundene Kniezahl und keine Satteländerung.',
    method: null,
    methodVersion: null,
    phaseSource: 'unavailable',
    side: null,
    mediaStartMs: 0,
    mediaEndMs: input.asset.durationMs,
    geometryRevision: null,
    metrics: [{ ...KNEE_UNAVAILABLE }],
    evidence,
    stub: true,
    completedAt,
  }
}

/** Reject soothing fakes: a stub must not report usable core metrics. */
export function honestObservation(observation: ObservationReport): ObservationReport {
  if (!observation.stub) {
    const knee = observation.metrics.find((item) => item.id === 'knee_flexion' || item.id === 'kneeFlexion')
    const kneeOk = Boolean(knee?.available && knee.value != null && Number.isFinite(knee.value))
    if (observation.status === 'usable' && !kneeOk) {
      return {
        ...observation,
        status: 'retake',
        reasons: unique([...observation.reasons, 'missing_knee']),
        reasonText:
          observation.reasonText ||
          'Ohne belastbare Kniebeobachtung gilt die Auswertung nicht als brauchbar. Keine beruhigende Ersatzzahl.',
      }
    }
    return observation
  }

  const captureIncomplete = observation.reasons.includes('capture_incomplete')
  const failed = observation.status === 'failed' || observation.reasons.includes('analysis_failed')
  return {
    ...observation,
    status: captureIncomplete ? 'retake' : failed ? 'failed' : 'incomplete',
    method: observation.method && observation.method !== 'bottom_dead_center' ? observation.method : null,
    methodVersion: null,
    phaseSource: 'unavailable',
    metrics: observation.metrics.map((metric) => ({
      ...metric,
      value: null,
      available: false,
      spread: null,
      usableCycles: 0,
      reasons: unique([...metric.reasons, 'analysis_stub', 'method_not_available']),
    })),
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}
