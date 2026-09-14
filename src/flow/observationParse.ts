import {
  OBSERVATION_KIND,
  OBSERVATION_PHASE_SOURCES,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_SIDES,
  OBSERVATION_STATUSES,
  type ObservationEvidenceRef,
  type ObservationMetric,
  type ObservationPhaseSource,
  type ObservationReport,
  type ObservationSide,
  type ObservationStatus,
} from '../types/observation.ts'
import type { ParseResult } from '../sessions/schema.ts'
import { honestObservation } from './analysisStub.ts'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function includes<T extends string>(set: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (set as readonly string[]).includes(value)
}

function parseEvidence(value: unknown, index: number): ParseResult<ObservationEvidenceRef> {
  if (!isPlainObject(value)) {
    return { ok: false, reason: `observation.evidence[${index}] must be an object` }
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: `observation.evidence[${index}].id must be a non-empty string` }
  }
  if (value.frameId !== undefined && typeof value.frameId !== 'string') {
    return { ok: false, reason: `observation.evidence[${index}].frameId must be a string` }
  }
  if (value.mediaTimeMs !== undefined && !isFiniteNumber(value.mediaTimeMs)) {
    return { ok: false, reason: `observation.evidence[${index}].mediaTimeMs must be a number` }
  }
  if (value.caption !== undefined && typeof value.caption !== 'string') {
    return { ok: false, reason: `observation.evidence[${index}].caption must be a string` }
  }
  return {
    ok: true,
    value: {
      id: value.id,
      ...(typeof value.frameId === 'string' ? { frameId: value.frameId } : {}),
      ...(isFiniteNumber(value.mediaTimeMs) ? { mediaTimeMs: value.mediaTimeMs } : {}),
      ...(typeof value.caption === 'string' ? { caption: value.caption } : {}),
    },
  }
}

function parseMetric(value: unknown, index: number): ParseResult<ObservationMetric> {
  if (!isPlainObject(value)) {
    return { ok: false, reason: `observation.metrics[${index}] must be an object` }
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: `observation.metrics[${index}].id must be a non-empty string` }
  }
  if (!(value.method === null || typeof value.method === 'string')) {
    return { ok: false, reason: `observation.metrics[${index}].method must be a string or null` }
  }
  if (!(value.methodVersion === null || typeof value.methodVersion === 'string')) {
    return { ok: false, reason: `observation.metrics[${index}].methodVersion must be a string or null` }
  }
  if (!isNumberOrNull(value.value)) {
    return { ok: false, reason: `observation.metrics[${index}].value must be a number or null` }
  }
  if (typeof value.unit !== 'string') {
    return { ok: false, reason: `observation.metrics[${index}].unit must be a string` }
  }
  if (!isFiniteNumber(value.usableCycles)) {
    return { ok: false, reason: `observation.metrics[${index}].usableCycles must be a number` }
  }
  if (!isNumberOrNull(value.spread)) {
    return { ok: false, reason: `observation.metrics[${index}].spread must be a number or null` }
  }
  if (typeof value.available !== 'boolean') {
    return { ok: false, reason: `observation.metrics[${index}].available must be a boolean` }
  }
  if (!Array.isArray(value.reasons) || value.reasons.some((item) => typeof item !== 'string')) {
    return { ok: false, reason: `observation.metrics[${index}].reasons must be a string array` }
  }
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.some((item) => typeof item !== 'string')) {
    return { ok: false, reason: `observation.metrics[${index}].evidenceIds must be a string array` }
  }
  return {
    ok: true,
    value: {
      id: value.id,
      method: value.method,
      methodVersion: value.methodVersion,
      value: value.value,
      unit: value.unit,
      usableCycles: value.usableCycles,
      spread: value.spread,
      available: value.available,
      reasons: value.reasons as string[],
      evidenceIds: value.evidenceIds as string[],
    },
  }
}

export function parseObservationReport(value: unknown): ParseResult<ObservationReport | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.observation must be an object' }
  if (value.kind !== undefined && value.kind !== OBSERVATION_KIND) {
    return { ok: false, reason: 'observation.kind must be bikefit.observation' }
  }
  if (value.schemaVersion !== OBSERVATION_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported observation.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (typeof value.captureId !== 'string' || value.captureId.trim() === '') {
    return { ok: false, reason: 'observation.captureId must be a non-empty string' }
  }
  if (typeof value.analysisId !== 'string' || value.analysisId.trim() === '') {
    return { ok: false, reason: 'observation.analysisId must be a non-empty string' }
  }
  if (typeof value.jobId !== 'string' || value.jobId.trim() === '') {
    return { ok: false, reason: 'observation.jobId must be a non-empty string' }
  }
  if (!(value.inputHash === null || typeof value.inputHash === 'string')) {
    return { ok: false, reason: 'observation.inputHash must be a string or null' }
  }
  if (typeof value.pipelineVersion !== 'string') {
    return { ok: false, reason: 'observation.pipelineVersion must be a string' }
  }
  if (!includes(OBSERVATION_STATUSES, value.status)) {
    return { ok: false, reason: 'observation.status must be usable, partial, retake, failed, or incomplete' }
  }
  if (!Array.isArray(value.reasons) || value.reasons.some((item) => typeof item !== 'string')) {
    return { ok: false, reason: 'observation.reasons must be a string array' }
  }
  if (typeof value.reasonText !== 'string' || value.reasonText.trim() === '') {
    return { ok: false, reason: 'observation.reasonText must be a concrete non-empty string' }
  }
  if (!(value.method === null || typeof value.method === 'string')) {
    return { ok: false, reason: 'observation.method must be a string or null' }
  }
  if (!(value.methodVersion === null || typeof value.methodVersion === 'string')) {
    return { ok: false, reason: 'observation.methodVersion must be a string or null' }
  }
  if (!includes(OBSERVATION_PHASE_SOURCES, value.phaseSource)) {
    return { ok: false, reason: 'observation.phaseSource must be marker, motion_estimate, or unavailable' }
  }
  if (!(value.side === null || includes(OBSERVATION_SIDES, value.side))) {
    return { ok: false, reason: 'observation.side must be left, right, or null' }
  }
  if (!isNumberOrNull(value.mediaStartMs) || !isNumberOrNull(value.mediaEndMs)) {
    return { ok: false, reason: 'observation media times must be numbers or null' }
  }
  if (!isNumberOrNull(value.geometryRevision)) {
    return { ok: false, reason: 'observation.geometryRevision must be a number or null' }
  }
  if (!Array.isArray(value.metrics)) {
    return { ok: false, reason: 'observation.metrics must be an array' }
  }
  const metrics: ObservationMetric[] = []
  for (const [index, entry] of value.metrics.entries()) {
    const parsed = parseMetric(entry, index)
    if (!parsed.ok) return parsed
    metrics.push(parsed.value)
  }
  if (!Array.isArray(value.evidence)) {
    return { ok: false, reason: 'observation.evidence must be an array' }
  }
  const evidence: ObservationEvidenceRef[] = []
  for (const [index, entry] of value.evidence.entries()) {
    const parsed = parseEvidence(entry, index)
    if (!parsed.ok) return parsed
    evidence.push(parsed.value)
  }
  if (typeof value.stub !== 'boolean') {
    return { ok: false, reason: 'observation.stub must be a boolean' }
  }
  if (typeof value.completedAt !== 'string') {
    return { ok: false, reason: 'observation.completedAt must be a string' }
  }

  const report: ObservationReport = {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId: value.captureId,
    analysisId: value.analysisId,
    jobId: value.jobId,
    inputHash: value.inputHash,
    pipelineVersion: value.pipelineVersion,
    status: value.status as ObservationStatus,
    reasons: value.reasons as string[],
    reasonText: value.reasonText,
    method: value.method,
    methodVersion: value.methodVersion,
    phaseSource: value.phaseSource as ObservationPhaseSource,
    side: value.side as ObservationSide | null,
    mediaStartMs: value.mediaStartMs,
    mediaEndMs: value.mediaEndMs,
    geometryRevision: value.geometryRevision,
    metrics,
    evidence,
    stub: value.stub,
    completedAt: value.completedAt,
  }
  return { ok: true, value: honestObservation(report) }
}

/**
 * Accept AP-05 / AP-03 payload shapes. Missing required fields fail parse —
 * we do not upgrade a partial blob into a usable fake result.
 */
export function parseAnalysisPayload(value: unknown): ParseResult<ObservationReport> {
  const parsed = parseObservationReport(value)
  if (!parsed.ok) return parsed
  if (!parsed.value) return { ok: false, reason: 'analysis payload missing' }
  return { ok: true, value: parsed.value }
}
