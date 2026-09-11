import { CALIBRATION_SCHEMA_VERSION, type BikeCalibration } from '../types/calibration.ts'
import {
  CAPTURE_SOURCES,
  EVALUATION_SOURCES,
  MEASUREMENT_RESULT_SCHEMA_VERSION,
  type AdapterSource,
  type MeasurementResult,
  type MetricBand,
  type MetricCardModel,
  type QualityLevel,
  type QualityReport,
  type Recommendation,
  type ResultMethod,
  type ResultProfile,
  type ResultProvenance,
  type ResultRuleVersion,
} from '../types/result.ts'
import type { ParseResult } from './schema.ts'

const BANDS: ReadonlySet<string> = new Set(['in', 'near', 'out', 'unknown'])
const QUALITY: ReadonlySet<string> = new Set(['ok', 'borderline', 'insufficient'])
const ADAPTERS: ReadonlySet<string> = new Set(['module', 'stub', 'mixed'])
const CAPTURE: ReadonlySet<string> = new Set(CAPTURE_SOURCES)
const EVALUATION: ReadonlySet<string> = new Set(EVALUATION_SOURCES)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10 && Number.isFinite(Date.parse(value))
}

function parseProfile(value: unknown): ParseResult<ResultProfile> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.profile must be an object' }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: 'result.profile.id must be a non-empty string' }
  }
  if (typeof value.name !== 'string') return { ok: false, reason: 'result.profile.name must be a string' }
  if (typeof value.productionEnabled !== 'boolean') {
    return { ok: false, reason: 'result.profile.productionEnabled must be a boolean' }
  }
  return {
    ok: true,
    value: { id: value.id, name: value.name, productionEnabled: value.productionEnabled },
  }
}

function parseProvenance(value: unknown): ParseResult<ResultProvenance> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.provenance must be an object' }
  if (typeof value.capture !== 'string' || !CAPTURE.has(value.capture)) {
    return { ok: false, reason: 'result.provenance.capture must be camera or synthetic' }
  }
  if (typeof value.evaluation !== 'string' || !EVALUATION.has(value.evaluation)) {
    return { ok: false, reason: 'result.provenance.evaluation must be standard or demo' }
  }
  if (typeof value.productRelease !== 'string' || value.productRelease.trim() === '') {
    return { ok: false, reason: 'result.provenance.productRelease must be a non-empty string' }
  }
  return {
    ok: true,
    value: {
      capture: value.capture as ResultProvenance['capture'],
      evaluation: value.evaluation as ResultProvenance['evaluation'],
      productRelease: value.productRelease,
    },
  }
}

function parseCard(value: unknown, index: number): ParseResult<MetricCardModel> {
  if (!isPlainObject(value)) return { ok: false, reason: `result.metrics[${index}] must be an object` }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: `result.metrics[${index}].id must be a non-empty string` }
  }
  if (typeof value.label !== 'string') {
    return { ok: false, reason: `result.metrics[${index}].label must be a string` }
  }
  if (!isNumberOrNull(value.value)) {
    return { ok: false, reason: `result.metrics[${index}].value must be a finite number or null` }
  }
  if (typeof value.unit !== 'string') {
    return { ok: false, reason: `result.metrics[${index}].unit must be a string` }
  }
  if (typeof value.band !== 'string' || !BANDS.has(value.band)) {
    return { ok: false, reason: `result.metrics[${index}].band is not a known band` }
  }
  if (typeof value.targetHint !== 'string') {
    return { ok: false, reason: `result.metrics[${index}].targetHint must be a string` }
  }
  const card: MetricCardModel = {
    id: value.id,
    label: value.label,
    value: value.value,
    unit: value.unit,
    band: value.band as MetricBand,
    targetHint: value.targetHint,
  }
  if (typeof value.detail === 'string') card.detail = value.detail
  return { ok: true, value: card }
}

function parseQuality(value: unknown): ParseResult<QualityReport> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.quality must be an object' }
  if (typeof value.level !== 'string' || !QUALITY.has(value.level)) {
    return { ok: false, reason: 'result.quality.level is not a known level' }
  }
  if (typeof value.label !== 'string') return { ok: false, reason: 'result.quality.label must be a string' }
  if (!isFiniteNumber(value.validRevs)) {
    return { ok: false, reason: 'result.quality.validRevs must be a finite number' }
  }
  if (!isFiniteNumber(value.targetRevs)) {
    return { ok: false, reason: 'result.quality.targetRevs must be a finite number' }
  }
  if (!isFiniteNumber(value.lostFrames)) {
    return { ok: false, reason: 'result.quality.lostFrames must be a finite number' }
  }
  if (!Array.isArray(value.notes) || value.notes.some((note) => typeof note !== 'string')) {
    return { ok: false, reason: 'result.quality.notes must be a string array' }
  }
  return {
    ok: true,
    value: {
      level: value.level as QualityLevel,
      label: value.label,
      validRevs: value.validRevs,
      targetRevs: value.targetRevs,
      lostFrames: value.lostFrames,
      notes: value.notes as string[],
    },
  }
}

function parseRecommendation(value: unknown, index: number): ParseResult<Recommendation> {
  if (!isPlainObject(value)) return { ok: false, reason: `result.recommendations[${index}] must be an object` }
  if (!isFiniteNumber(value.priority)) {
    return { ok: false, reason: `result.recommendations[${index}].priority must be a finite number` }
  }
  if (typeof value.title !== 'string') {
    return { ok: false, reason: `result.recommendations[${index}].title must be a string` }
  }
  if (typeof value.reason !== 'string') {
    return { ok: false, reason: `result.recommendations[${index}].reason must be a string` }
  }
  const item: Recommendation = { priority: value.priority, title: value.title, reason: value.reason }
  if (typeof value.metricId === 'string') item.metricId = value.metricId
  if (typeof value.deltaHint === 'string') item.deltaHint = value.deltaHint
  return { ok: true, value: item }
}

function parseRuleVersion(value: unknown, index: number): ParseResult<ResultRuleVersion> {
  if (!isPlainObject(value)) return { ok: false, reason: `result.ruleVersions[${index}] must be an object` }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: `result.ruleVersions[${index}].id must be a non-empty string` }
  }
  if (!isFiniteNumber(value.schemaVersion)) {
    return { ok: false, reason: `result.ruleVersions[${index}].schemaVersion must be a finite number` }
  }
  if (typeof value.status !== 'string') {
    return { ok: false, reason: `result.ruleVersions[${index}].status must be a string` }
  }
  if (typeof value.productionEnabled !== 'boolean') {
    return { ok: false, reason: `result.ruleVersions[${index}].productionEnabled must be a boolean` }
  }
  if (typeof value.method !== 'string') {
    return { ok: false, reason: `result.ruleVersions[${index}].method must be a string` }
  }
  return {
    ok: true,
    value: {
      id: value.id,
      schemaVersion: value.schemaVersion,
      status: value.status,
      productionEnabled: value.productionEnabled,
      method: value.method,
    },
  }
}

function parseMethod(value: unknown): ParseResult<ResultMethod> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.method must be an object' }
  if (typeof value.metrics !== 'string') return { ok: false, reason: 'result.method.metrics must be a string' }
  if (typeof value.rules !== 'string') return { ok: false, reason: 'result.method.rules must be a string' }
  if (typeof value.aggregation !== 'string') {
    return { ok: false, reason: 'result.method.aggregation must be a string' }
  }
  if (typeof value.calibration !== 'string') {
    return { ok: false, reason: 'result.method.calibration must be a string' }
  }
  return {
    ok: true,
    value: {
      metrics: value.metrics,
      rules: value.rules,
      aggregation: value.aggregation,
      calibration: value.calibration,
    },
  }
}

function parseAdapters(value: unknown): ParseResult<Record<string, AdapterSource>> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.adapters must be an object' }
  const out: Record<string, AdapterSource> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string' || !ADAPTERS.has(item)) {
      return { ok: false, reason: `result.adapters.${key} is not a known adapter source` }
    }
    out[key] = item as AdapterSource
  }
  return { ok: true, value: out }
}

function parsePoint(value: unknown): { x: number; y: number } | null | undefined {
  if (value === null) return null
  if (!isPlainObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return undefined
  return { x: value.x, y: value.y }
}

function parseCalibration(value: unknown): ParseResult<BikeCalibration> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result.calibration must be an object' }
  const version = isFiniteNumber(value.version) ? value.version : CALIBRATION_SCHEMA_VERSION
  if (!isPlainObject(value.marks)) return { ok: false, reason: 'result.calibration.marks must be an object' }
  const B = parsePoint(value.marks.B ?? null)
  const S = parsePoint(value.marks.S ?? null)
  const G = parsePoint(value.marks.G ?? null)
  if (B === undefined || S === undefined || G === undefined) {
    return { ok: false, reason: 'result.calibration.marks B/S/G must be points or null' }
  }
  if (!isTimestamp(value.createdAt)) return { ok: false, reason: 'result.calibration.createdAt must be a timestamp' }
  if (!isTimestamp(value.updatedAt)) return { ok: false, reason: 'result.calibration.updatedAt must be a timestamp' }

  let transform: BikeCalibration['transform'] = null
  if (value.transform !== null && value.transform !== undefined) {
    if (!isPlainObject(value.transform)) {
      return { ok: false, reason: 'result.calibration.transform must be an object or null' }
    }
    const originPx = parsePoint(value.transform.originPx)
    const forwardPx = parsePoint(value.transform.forwardPx)
    const upPx = parsePoint(value.transform.upPx)
    if (!originPx || !forwardPx || !upPx) {
      return { ok: false, reason: 'result.calibration.transform is missing axis points' }
    }
    if (value.transform.facing !== 1 && value.transform.facing !== -1) {
      return { ok: false, reason: 'result.calibration.transform.facing must be 1 or -1' }
    }
    const pixelsPerMm = value.transform.pixelsPerMm
    if (!(pixelsPerMm === null || isFiniteNumber(pixelsPerMm))) {
      return { ok: false, reason: 'result.calibration.transform.pixelsPerMm must be a finite number or null' }
    }
    transform = {
      originPx,
      forwardPx,
      upPx,
      facing: value.transform.facing,
      pixelsPerMm,
    }
  }

  return {
    ok: true,
    value: {
      version,
      marks: { B, S, G },
      transform,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    },
  }
}

/** Validate and strip unknown keys on a frozen flow result. */
export function parseMeasurementResult(value: unknown): ParseResult<MeasurementResult> {
  if (!isPlainObject(value)) return { ok: false, reason: 'result must be an object' }
  if (value.schemaVersion !== MEASUREMENT_RESULT_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported result.schemaVersion ${String(value.schemaVersion)} (want ${MEASUREMENT_RESULT_SCHEMA_VERSION})`,
    }
  }
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    return { ok: false, reason: 'result.id must be a non-empty string' }
  }
  if (!isTimestamp(value.createdAt)) return { ok: false, reason: 'result.createdAt must be a parseable timestamp' }
  if (!isPlainObject(value.time) || !isTimestamp(value.time.startedAt) || !isTimestamp(value.time.endedAt)) {
    return { ok: false, reason: 'result.time must include startedAt and endedAt timestamps' }
  }

  const provenance = parseProvenance(value.provenance)
  if (!provenance.ok) return provenance
  const profile = parseProfile(value.profile)
  if (!profile.ok) return profile
  const method = parseMethod(value.method)
  if (!method.ok) return method
  const calibration = parseCalibration(value.calibration)
  if (!calibration.ok) return calibration
  const quality = parseQuality(value.quality)
  if (!quality.ok) return quality
  const adapters = parseAdapters(value.adapters)
  if (!adapters.ok) return adapters

  if (!Array.isArray(value.ruleVersions)) return { ok: false, reason: 'result.ruleVersions must be an array' }
  const ruleVersions: ResultRuleVersion[] = []
  for (const [index, entry] of value.ruleVersions.entries()) {
    const parsed = parseRuleVersion(entry, index)
    if (!parsed.ok) return parsed
    ruleVersions.push(parsed.value)
  }

  if (!Array.isArray(value.metrics)) return { ok: false, reason: 'result.metrics must be an array' }
  const metrics: MetricCardModel[] = []
  for (const [index, entry] of value.metrics.entries()) {
    const parsed = parseCard(entry, index)
    if (!parsed.ok) return parsed
    metrics.push(parsed.value)
  }

  if (!Array.isArray(value.recommendations)) {
    return { ok: false, reason: 'result.recommendations must be an array' }
  }
  const recommendations: Recommendation[] = []
  for (const [index, entry] of value.recommendations.entries()) {
    const parsed = parseRecommendation(entry, index)
    if (!parsed.ok) return parsed
    recommendations.push(parsed.value)
  }

  if (!isFiniteNumber(value.validRevs)) return { ok: false, reason: 'result.validRevs must be a finite number' }
  if (!isFiniteNumber(value.targetRevs)) return { ok: false, reason: 'result.targetRevs must be a finite number' }

  return {
    ok: true,
    value: {
      schemaVersion: MEASUREMENT_RESULT_SCHEMA_VERSION,
      id: value.id,
      createdAt: value.createdAt,
      time: { startedAt: value.time.startedAt, endedAt: value.time.endedAt },
      provenance: provenance.value,
      profile: profile.value,
      ruleVersions,
      method: method.value,
      calibration: calibration.value,
      metrics,
      quality: quality.value,
      recommendations,
      validRevs: value.validRevs,
      targetRevs: value.targetRevs,
      adapters: adapters.value,
    },
  }
}
