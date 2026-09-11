import { RULE_PROFILES } from '../rules/catalog.ts'
import { CALIBRATION_SCHEMA_VERSION, type BikeCalibration } from '../types/calibration.ts'
import type { MetricsReport } from '../types/metrics.ts'
import {
  MEASUREMENT_RESULT_SCHEMA_VERSION,
  PRODUCT_RELEASE_P0,
  frozenResultSource,
  type AdapterSource,
  type CaptureSource,
  type EvaluationSource,
  type MeasurementResult,
  type MetricCardModel,
  type QualityReport,
  type Recommendation,
  type ResultFileSource,
  type ResultProfile,
} from '../types/result.ts'
import type { FootCycleDiagnostic } from '../types/foot.ts'
import type { PhaseEvidence } from '../types/phase.ts'
import type { PlaneScale } from '../types/scale.ts'
import type { SavedSession } from './types.ts'

export function cloneJson<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function newResultId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export type FrozenMetricsHost = {
  report: MetricsReport
  /** PR1 report snapshot, or a boolean flag from MeasurementSnapshot.frozen. */
  frozen?: MetricsReport | boolean | null
  freeze?: () => MetricsReport | null | void
}

function asReport(value: MetricsReport | boolean | null | undefined): MetricsReport | null {
  return value && typeof value === 'object' ? value : null
}

/** Consume PR1 freeze when present; otherwise snapshot the live report. */
export function consumeFrozenReport(metrics: FrozenMetricsHost): MetricsReport {
  let frozen = asReport(metrics.frozen)
  if (typeof metrics.freeze === 'function') {
    try {
      const out = metrics.freeze()
      if (out) frozen = out
      else frozen = asReport(metrics.frozen) ?? frozen
    } catch {
      frozen = asReport(metrics.frozen) ?? frozen
    }
  }
  return cloneJson(frozen ?? metrics.report)
}

export function snapshotRuleVersions() {
  return RULE_PROFILES.map((profile) => ({
    id: profile.id,
    schemaVersion: profile.schemaVersion,
    status: profile.status,
    productionEnabled: profile.productionEnabled,
    method: profile.method,
  }))
}

export function storageWriteMessage(err: unknown): string {
  const name =
    typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : ''
  if (name === 'QuotaExceededError') {
    return 'Speichern fehlgeschlagen: Speicher voll (Quota). Exportieren Sie eine lokale Kopie.'
  }
  if (err instanceof Error && err.message.trim()) {
    return `Speichern fehlgeschlagen: ${err.message}`
  }
  return 'Speichern fehlgeschlagen. Der Ergebnisdatensatz ist unverändert — bitte erneut versuchen oder exportieren.'
}

export function buildMeasurementResult(input: {
  id?: string
  createdAt?: string
  startedAt: string
  endedAt?: string
  capture: CaptureSource
  evaluation: EvaluationSource
  productRelease?: string
  profile: ResultProfile
  calibration: BikeCalibration
  metrics: MetricCardModel[]
  quality: QualityReport
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  adapters: Record<string, AdapterSource>
  file?: ResultFileSource | null
  mediaStartMs?: number
  mediaEndMs?: number
  phaseEvidence?: PhaseEvidence | null
  scale?: PlaneScale | null
  foot?: FootCycleDiagnostic | null
}): MeasurementResult {
  const createdAt = input.createdAt ?? input.endedAt ?? new Date().toISOString()
  const endedAt = input.endedAt ?? createdAt
  const calibration = cloneJson(input.calibration)
  return {
    schemaVersion: MEASUREMENT_RESULT_SCHEMA_VERSION,
    id: input.id ?? newResultId(),
    createdAt,
    time: {
      startedAt: input.startedAt,
      endedAt,
      ...(input.mediaStartMs !== undefined ? { mediaStartMs: input.mediaStartMs } : {}),
      ...(input.mediaEndMs !== undefined ? { mediaEndMs: input.mediaEndMs } : {}),
    },
    source: frozenResultSource(input.capture, input.evaluation),
    provenance: {
      capture: input.capture,
      evaluation: input.evaluation,
      productRelease: input.productRelease ?? PRODUCT_RELEASE_P0,
    },
    profile: cloneJson(input.profile),
    ruleVersions: snapshotRuleVersions(),
    method: {
      metrics: 'E4 MetricsReport median over valid cycles',
      rules: 'decideRule + recommendRule §10.4',
      aggregation: 'per-cycle mean, then median / IQR',
      calibration: `pixelToBike v${calibration.version ?? CALIBRATION_SCHEMA_VERSION}`,
    },
    calibration,
    metrics: cloneJson(input.metrics),
    quality: cloneJson(input.quality),
    recommendations: cloneJson(input.recommendations),
    validRevs: input.validRevs,
    targetRevs: input.targetRevs,
    adapters: { ...input.adapters },
    ...(input.file !== undefined ? { file: input.file ? cloneJson(input.file) : null } : {}),
    ...(input.phaseEvidence ? { phaseEvidence: cloneJson(input.phaseEvidence) } : {}),
    ...(input.scale !== undefined ? { scale: input.scale ? cloneJson(input.scale) : null } : {}),
    ...(input.foot !== undefined ? { foot: input.foot ? cloneJson(input.foot) : null } : {}),
  }
}

export type LegacySavedShape = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  profile?: ResultProfile
  quality?: QualityReport
  metrics?: MetricCardModel[]
  recommendations?: Recommendation[]
  validRevs?: number
  targetRevs?: number
  calibration?: BikeCalibration
  adapters?: Record<string, AdapterSource>
  result?: MeasurementResult
}

function emptyQuality(validRevs = 0, targetRevs = 0): QualityReport {
  return {
    level: 'insufficient',
    label: 'Qualität unzureichend',
    validRevs,
    targetRevs,
    lostFrames: 0,
    notes: [],
    trackingLevel: 'insufficient',
    requiredMetricsOk: false,
    usableCycles: {},
    measurementId: null,
  }
}

const EMPTY_CALIBRATION: BikeCalibration = {
  version: CALIBRATION_SCHEMA_VERSION,
  marks: { B: null, S: null, G: null },
  transform: null,
  createdAt: '1970-01-01T00:00:00.000Z',
  updatedAt: '1970-01-01T00:00:00.000Z',
}

const LAB_FALLBACK: ResultProfile = {
  id: 'lab',
  name: 'Labor / nicht freigegeben',
  productionEnabled: false,
}

/** Rebuild a dataset from a pre-result sidecar row so open/export still have a full object. */
export function resultFromLegacySaved(row: LegacySavedShape): MeasurementResult {
  if (row.result) return cloneJson(row.result)
  const quality = row.quality ?? emptyQuality(row.validRevs ?? 0, row.targetRevs ?? 0)
  return buildMeasurementResult({
    id: row.id,
    createdAt: row.createdAt,
    startedAt: row.createdAt,
    endedAt: row.updatedAt,
    capture: 'camera',
    evaluation: 'standard',
    profile: row.profile ?? LAB_FALLBACK,
    calibration: row.calibration ?? { ...EMPTY_CALIBRATION, createdAt: row.createdAt, updatedAt: row.updatedAt },
    metrics: row.metrics ?? [],
    quality,
    recommendations: row.recommendations ?? [],
    validRevs: row.validRevs ?? quality.validRevs,
    targetRevs: row.targetRevs ?? quality.targetRevs,
    adapters: row.adapters ?? {
      sessions: 'module',
      metrics: 'module',
      rules: 'module',
      soll: 'module',
    },
  })
}

export function hydrateSavedSession(row: unknown): SavedSession | null {
  if (!row || typeof row !== 'object') return null
  const rec = row as LegacySavedShape
  if (typeof rec.id !== 'string' || rec.id.trim() === '') return null
  const title = typeof rec.title === 'string' ? rec.title : rec.id.slice(0, 8)
  const createdAt = typeof rec.createdAt === 'string' ? rec.createdAt : new Date().toISOString()
  const updatedAt = typeof rec.updatedAt === 'string' ? rec.updatedAt : createdAt
  try {
    return {
      id: rec.id,
      title,
      createdAt,
      updatedAt,
      result: resultFromLegacySaved({ ...rec, title, createdAt, updatedAt }),
    }
  } catch {
    return null
  }
}

export function savedFromResult(
  result: MeasurementResult,
  meta?: { id?: string; title?: string; createdAt?: string; updatedAt?: string },
): SavedSession {
  const now = new Date().toISOString()
  return {
    id: meta?.id ?? result.id,
    title: meta?.title ?? `Messung ${now}`,
    createdAt: meta?.createdAt ?? result.createdAt,
    updatedAt: meta?.updatedAt ?? now,
    result: cloneJson(result),
  }
}
