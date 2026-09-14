import { CALIBRATION_SCHEMA_VERSION, type BikeCalibration } from '../types/calibration.ts'
import type { CaptureAsset } from '../types/capture.ts'
import type { ObservationReport, ResultIdentitySnapshot } from '../types/observation.ts'
import type { MeasurementResult, MetricCardModel, QualityReport } from '../types/result.ts'
import { actionFromMeasurementResult, presentActionDecision } from '../action/present.ts'
import { recommendationsFromAction } from '../action/recommendations.ts'
import { buildMeasurementResult, cloneJson } from './buildResult.ts'
import { decideFromObservation, evidenceRefsOf, kneeMetric } from './outcome.ts'
import { honestObservation } from './analysisStub.ts'
import { LAB_PROFILE } from './profile.ts'

const EMPTY_CALIBRATION: BikeCalibration = {
  version: CALIBRATION_SCHEMA_VERSION,
  marks: { B: null, S: null, G: null },
  transform: null,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
}

function cardsFromObservation(observation: ObservationReport): MetricCardModel[] {
  const knee = kneeMetric(observation)
  const kneeCard: MetricCardModel = {
    id: 'knee_flexion',
    label: 'Kniebeugung',
    value: knee?.available ? (knee.value ?? null) : null,
    unit: '°',
    method: observation.method ?? knee?.method ?? null,
    usableCycles: knee?.usableCycles ?? 0,
    band: 'unknown',
    targetHint: observation.stub
      ? 'Platzhalter — keine Methode in diesem Stand'
      : observation.method === 'max_extension'
        ? 'nahe größter Streckung'
        : observation.method === 'bottom_dead_center'
          ? 'am unteren Pedaltotpunkt'
          : 'Beobachtung',
    detail: observation.reasonText,
  }
  const extra = observation.metrics
    .filter((item) => item.id !== 'knee_flexion' && item.id !== 'kneeFlexion' && item.available)
    .slice(0, 2)
    .map((item) => ({
      id: item.id,
      label: item.id,
      value: item.value,
      unit: item.unit === 'deg' ? '°' : item.unit,
      method: item.method,
      usableCycles: item.usableCycles,
      band: 'unknown' as const,
      targetHint: item.available ? 'zusätzlich verfügbar' : 'nicht verfügbar',
    }))
  return [kneeCard, ...extra]
}

function qualityFromObservation(observation: ObservationReport): QualityReport {
  const knee = kneeMetric(observation)
  const ok = observation.status === 'usable' && Boolean(knee?.available)
  return {
    level: ok ? 'ok' : observation.status === 'partial' ? 'borderline' : 'insufficient',
    label: ok ? 'Qualität ausreichend' : 'Qualität unzureichend',
    validRevs: knee?.usableCycles ?? 0,
    targetRevs: 10,
    lostFrames: 0,
    notes: [observation.reasonText],
    trackingLevel: ok ? 'ok' : 'insufficient',
    requiredMetricsOk: ok,
    usableCycles: { knee_flexion: knee?.usableCycles ?? 0 },
    measurementId: observation.analysisId,
  }
}

export function freezeObservationResult(input: {
  observation: ObservationReport
  capture?: Pick<CaptureAsset, 'captureId' | 'filename' | 'mimeType' | 'width' | 'height' | 'durationMs'>
  captureSource?: MeasurementResult['provenance']['capture']
}): MeasurementResult {
  const observation = honestObservation(input.observation)
  const action = decideFromObservation(observation)
  const recs = recommendationsFromAction(action)
  const endedAt = observation.completedAt
  const file = input.capture
    ? {
        kind: 'video' as const,
        name: input.capture.filename,
        mimeType: input.capture.mimeType,
        width: input.capture.width,
        height: input.capture.height,
        durationMs: input.capture.durationMs,
        mediaTimeRangeMs: {
          start: observation.mediaStartMs ?? 0,
          end: observation.mediaEndMs ?? input.capture.durationMs,
        },
        staticCheck: false,
        rotationDeg: 0 as const,
        crop: null,
        upload: false as const,
      }
    : undefined
  return buildMeasurementResult({
    startedAt: endedAt,
    endedAt,
    capture: input.captureSource ?? 'camera',
    evaluation: 'standard',
    profile: LAB_PROFILE,
    calibration: {
      ...EMPTY_CALIBRATION,
      createdAt: endedAt,
      updatedAt: endedAt,
    },
    metrics: cardsFromObservation(observation),
    quality: qualityFromObservation(observation),
    recommendations: recs,
    actionDecision: action,
    validRevs: kneeMetric(observation)?.usableCycles ?? 0,
    targetRevs: 10,
    adapters: {
      sessions: 'module',
      metrics: observation.stub ? 'stub' : 'module',
      rules: 'module',
      soll: 'module',
    },
    file,
    mediaStartMs: observation.mediaStartMs ?? undefined,
    mediaEndMs: observation.mediaEndMs ?? undefined,
    captureId: observation.captureId,
    analysisId: observation.analysisId,
    observation,
  })
}

export function identitySnapshotOf(result: MeasurementResult): ResultIdentitySnapshot {
  const action = result.actionDecision
    ? presentActionDecision(result.actionDecision)
    : actionFromMeasurementResult(result)
  const observation = result.observation
  return {
    captureId: result.captureId ?? action.captureId ?? result.id,
    analysisId: result.analysisId ?? action.analysisId ?? result.id,
    method: observation?.method ?? action.method,
    methodVersion: observation?.methodVersion ?? null,
    actionDecision: action,
    evidenceRefs: action.evidenceIds.length ? action.evidenceIds : observation ? evidenceRefsOf(observation) : [],
  }
}

export function cloneObservationResult(result: MeasurementResult): MeasurementResult {
  return cloneJson(result)
}
