import type {
  RuleOwner,
  RuleProfile,
  RuleProfileCopy,
  RuleProfileStatus,
  RuleRecommendation,
  RuleSource,
} from '../types/rules.ts'
import {
  RULE_METHODS,
  RULE_METRICS,
  RULE_PROFILE_SCHEMA_VERSION,
  RULE_PROFILE_STATUSES,
} from '../types/rules.ts'

const EXACT_MM = /\d+(?:[.,]\d+)?\s*mm\b/i
const EXAKT_SATTEL = /sattel\s+exakt/i

export class RuleProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuleProfileError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuleProfileError(`${field} must be a non-empty string`)
  }
  return value
}

function asNullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new RuleProfileError(`${field} must be a string or null`)
  }
  return value
}

function asFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RuleProfileError(`${field} must be a finite number`)
  }
  return value
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new RuleProfileError(`${field} must be a boolean`)
  }
  return value
}

function includes<T extends string>(allowed: readonly T[], value: string, field: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T
  throw new RuleProfileError(`${field} must be one of ${allowed.join(', ')}`)
}

function parseSource(value: unknown, index: number): RuleSource {
  if (!isRecord(value)) throw new RuleProfileError(`sources[${index}] must be an object`)
  return {
    id: asString(value.id, `sources[${index}].id`),
    citation: asString(value.citation, `sources[${index}].citation`),
    year: value.year === null ? null : asFiniteNumber(value.year, `sources[${index}].year`),
    url: asNullableString(value.url, `sources[${index}].url`),
    note: asNullableString(value.note, `sources[${index}].note`),
  }
}

function parseOwner(value: unknown): RuleOwner {
  if (!isRecord(value)) throw new RuleProfileError('owner must be an object')
  return {
    name: asString(value.name, 'owner.name'),
    role: asString(value.role, 'owner.role'),
  }
}

function parseRecommendation(value: unknown, field: string): RuleRecommendation {
  if (!isRecord(value)) throw new RuleProfileError(`${field} must be an object`)
  const rec: RuleRecommendation = {
    observation: asString(value.observation, `${field}.observation`),
    possibleCause: asString(value.possibleCause, `${field}.possibleCause`),
    prerequisite: asString(value.prerequisite, `${field}.prerequisite`),
    nextStep: asString(value.nextStep, `${field}.nextStep`),
    remeasure: asString(value.remeasure, `${field}.remeasure`),
  }
  assertSafeRecommendation(rec, field)
  return rec
}

function parseCopy(value: unknown): RuleProfileCopy {
  if (!isRecord(value)) throw new RuleProfileError('copy must be an object')
  return {
    metricLabel: asString(value.metricLabel, 'copy.metricLabel'),
    within: parseRecommendation(value.within, 'copy.within'),
    borderlineHigh: parseRecommendation(value.borderlineHigh, 'copy.borderlineHigh'),
    borderlineLow: parseRecommendation(value.borderlineLow, 'copy.borderlineLow'),
    outsideHigh: parseRecommendation(value.outsideHigh, 'copy.outsideHigh'),
    outsideLow: parseRecommendation(value.outsideLow, 'copy.outsideLow'),
    unavailable: parseRecommendation(value.unavailable, 'copy.unavailable'),
  }
}

/** Plan §10.4: never emit exact saddle millimetres. */
export function assertSafeRecommendation(rec: RuleRecommendation, field = 'recommendation'): void {
  for (const [key, text] of Object.entries(rec)) {
    if (EXACT_MM.test(text) || EXAKT_SATTEL.test(text)) {
      throw new RuleProfileError(
        `${field}.${key} must not contain exact saddle millimetres (plan §10.4)`,
      )
    }
  }
}

export function parseRuleProfile(raw: unknown): RuleProfile {
  if (!isRecord(raw)) throw new RuleProfileError('profile must be an object')
  const schemaVersion = asFiniteNumber(raw.schemaVersion, 'schemaVersion')
  if (schemaVersion !== RULE_PROFILE_SCHEMA_VERSION) {
    throw new RuleProfileError(`unsupported schemaVersion ${schemaVersion}`)
  }

  const status = includes<RuleProfileStatus>(
    RULE_PROFILE_STATUSES,
    asString(raw.status, 'status'),
    'status',
  )
  const productionEnabled = asBoolean(raw.productionEnabled, 'productionEnabled')
  if (productionEnabled && status !== 'approved') {
    throw new RuleProfileError('productionEnabled requires status=approved')
  }
  if (productionEnabled && asNullableString(raw.reviewedAt, 'reviewedAt') === null) {
    throw new RuleProfileError('productionEnabled requires reviewedAt')
  }

  const targetDeg = asFiniteNumber(raw.targetDeg, 'targetDeg')
  const outsideMarginDeg = asFiniteNumber(raw.outsideMarginDeg, 'outsideMarginDeg')
  const minCycles = asFiniteNumber(raw.minCycles, 'minCycles')
  const assumedUncertaintyDeg = asFiniteNumber(raw.assumedUncertaintyDeg, 'assumedUncertaintyDeg')
  if (outsideMarginDeg <= 0) throw new RuleProfileError('outsideMarginDeg must be > 0')
  if (minCycles < 1 || !Number.isInteger(minCycles)) {
    throw new RuleProfileError('minCycles must be an integer ≥ 1')
  }
  if (assumedUncertaintyDeg < 0) {
    throw new RuleProfileError('assumedUncertaintyDeg must be ≥ 0')
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw new RuleProfileError('sources must be a non-empty array')
  }

  return {
    schemaVersion: RULE_PROFILE_SCHEMA_VERSION,
    id: asString(raw.id, 'id'),
    status,
    productionEnabled,
    metric: includes(RULE_METRICS, asString(raw.metric, 'metric'), 'metric'),
    method: includes(RULE_METHODS, asString(raw.method, 'method'), 'method'),
    targetDeg,
    outsideMarginDeg,
    minCycles,
    assumedUncertaintyDeg,
    owner: parseOwner(raw.owner),
    reviewedAt: asNullableString(raw.reviewedAt, 'reviewedAt'),
    reviewer: asNullableString(raw.reviewer, 'reviewer'),
    sources: raw.sources.map(parseSource),
    notes: asString(raw.notes, 'notes'),
    copy: parseCopy(raw.copy),
  }
}
