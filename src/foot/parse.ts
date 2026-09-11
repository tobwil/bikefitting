import { FOOT_DIAGNOSTIC_SCHEMA_VERSION, FOOT_STATUSES, type FootCycleDiagnostic } from '../types/foot.ts'

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function parseFootDiagnostic(value: unknown): ParseResult<FootCycleDiagnostic | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: null }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.foot must be an object or null' }
  if (value.schemaVersion !== FOOT_DIAGNOSTIC_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported foot.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (typeof value.status !== 'string' || !FOOT_STATUSES.includes(value.status as FootCycleDiagnostic['status'])) {
    return { ok: false, reason: 'result.foot.status is not a known status' }
  }
  if (typeof value.reason !== 'string') return { ok: false, reason: 'result.foot.reason must be a string' }
  if (!isFiniteNumber(value.samples) || !isFiniteNumber(value.usableSamples) || !isFiniteNumber(value.occludedSamples)) {
    return { ok: false, reason: 'result.foot sample counts must be finite numbers' }
  }
  if (typeof value.heelOccluded !== 'boolean' || typeof value.toeOccluded !== 'boolean') {
    return { ok: false, reason: 'result.foot heel/toe occlusion flags must be boolean' }
  }
  if (typeof value.metricLocked !== 'boolean' || typeof value.lengthClaimsAllowed !== 'boolean') {
    return { ok: false, reason: 'result.foot lock/length flags must be boolean' }
  }
  if (!isPlainObject(value.overlay) || typeof value.overlay.heelVisible !== 'boolean' || typeof value.overlay.toeVisible !== 'boolean') {
    return { ok: false, reason: 'result.foot.overlay must include heelVisible and toeVisible' }
  }
  if (!Array.isArray(value.metricCards) || value.metricCards.length !== 0) {
    return { ok: false, reason: 'result.foot.metricCards must be an empty array (no cards in this stage)' }
  }
  if (!Array.isArray(value.recommendations) || value.recommendations.length !== 0) {
    return { ok: false, reason: 'result.foot.recommendations must be an empty array (no recs in this stage)' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: FOOT_DIAGNOSTIC_SCHEMA_VERSION,
      status: value.status as FootCycleDiagnostic['status'],
      reason: value.reason,
      samples: value.samples,
      usableSamples: value.usableSamples,
      occludedSamples: value.occludedSamples,
      heelOccluded: value.heelOccluded,
      toeOccluded: value.toeOccluded,
      metricLocked: value.metricLocked,
      lengthClaimsAllowed: value.lengthClaimsAllowed,
      overlay: { heelVisible: value.overlay.heelVisible, toeVisible: value.overlay.toeVisible },
      metricCards: [],
      recommendations: [],
    },
  }
}
