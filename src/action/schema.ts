import type {
  ActionAudience,
  ActionBlockReason,
  ActionDecision,
  ActionDirection,
  ActionKind,
  ActionLensStatus,
  ActionParameter,
  ActionReleaseStatus,
  ActionReportValues,
  ActionTemplate,
} from '../types/action.ts'
import {
  ACTION_AUDIENCES,
  ACTION_BLOCK_REASONS,
  ACTION_DECISION_KIND,
  ACTION_DECISION_SCHEMA_VERSION,
  ACTION_DIRECTIONS,
  ACTION_KINDS,
  ACTION_PARAMETERS,
  ACTION_RELEASE_STATUSES,
} from '../types/action.ts'
import { assertSafeActionTemplate } from './copy.ts'

export type ParseActionResult<T> = { ok: true; value: T } | { ok: false; reason: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function includes<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function parseTemplate(value: unknown): ParseActionResult<ActionTemplate> {
  if (!isPlainObject(value)) return { ok: false, reason: 'actionDecision.template must be an object' }
  if (typeof value.what !== 'string' || typeof value.why !== 'string' || typeof value.how !== 'string') {
    return { ok: false, reason: 'actionDecision.template needs what, why, how strings' }
  }
  const template: ActionTemplate = { what: value.what, why: value.why, how: value.how }
  try {
    assertSafeActionTemplate(template, 'actionDecision.template')
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unsafe action template' }
  }
  return { ok: true, value: template }
}

function parseReport(value: unknown): ParseActionResult<ActionReportValues> {
  if (!isPlainObject(value)) return { ok: false, reason: 'actionDecision.report must be an object' }
  if (
    !isNumberOrNull(value.valueDeg) ||
    !isNumberOrNull(value.uncertaintyDeg) ||
    !isNumberOrNull(value.cycles) ||
    !isNumberOrNull(value.targetDeg) ||
    !isNumberOrNull(value.lowBoundDeg) ||
    !isNumberOrNull(value.highBoundDeg)
  ) {
    return { ok: false, reason: 'actionDecision.report values must be numbers or null' }
  }
  return {
    ok: true,
    value: {
      valueDeg: value.valueDeg,
      uncertaintyDeg: value.uncertaintyDeg,
      cycles: value.cycles,
      targetDeg: value.targetDeg,
      lowBoundDeg: value.lowBoundDeg,
      highBoundDeg: value.highBoundDeg,
    },
  }
}

export function parseActionDecision(value: unknown): ParseActionResult<ActionDecision | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.actionDecision must be an object' }
  if (value.schemaVersion !== ACTION_DECISION_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `unsupported actionDecision.schemaVersion ${String(value.schemaVersion)}`,
    }
  }
  if (value.type !== undefined && value.type !== ACTION_DECISION_KIND) {
    return { ok: false, reason: 'actionDecision.type must be bikefit.action-decision' }
  }
  if (!includes(ACTION_KINDS, value.kind)) {
    return { ok: false, reason: 'actionDecision.kind must be adjust, keep, retake, or review' }
  }
  if (!(value.captureId === null || typeof value.captureId === 'string')) {
    return { ok: false, reason: 'actionDecision.captureId must be a string or null' }
  }
  if (!(value.analysisId === null || typeof value.analysisId === 'string')) {
    return { ok: false, reason: 'actionDecision.analysisId must be a string or null' }
  }
  if (!(value.ruleId === null || typeof value.ruleId === 'string')) {
    return { ok: false, reason: 'actionDecision.ruleId must be a string or null' }
  }
  if (!(value.ruleVersion === null || isFiniteNumber(value.ruleVersion))) {
    return { ok: false, reason: 'actionDecision.ruleVersion must be a number or null' }
  }
  if (!(value.method === null || typeof value.method === 'string')) {
    return { ok: false, reason: 'actionDecision.method must be a string or null' }
  }
  if (!includes(ACTION_RELEASE_STATUSES, value.releaseStatus)) {
    return { ok: false, reason: 'actionDecision.releaseStatus is not a known Freigabestatus' }
  }
  if (typeof value.released !== 'boolean' || typeof value.productionEnabled !== 'boolean') {
    return { ok: false, reason: 'actionDecision.released and productionEnabled must be booleans' }
  }
  if (!Array.isArray(value.evidenceIds) || value.evidenceIds.some((id) => typeof id !== 'string')) {
    return { ok: false, reason: 'actionDecision.evidenceIds must be a string array' }
  }
  if (!(value.parameter === null || includes(ACTION_PARAMETERS, value.parameter))) {
    return { ok: false, reason: 'actionDecision.parameter must be seat_height or null' }
  }
  if (!(value.direction === null || includes(ACTION_DIRECTIONS, value.direction))) {
    return { ok: false, reason: 'actionDecision.direction must be higher, lower, or null' }
  }
  if (!includes(ACTION_AUDIENCES, value.audience)) {
    return { ok: false, reason: 'actionDecision.audience must be beginner or lab' }
  }
  if (!Array.isArray(value.blockReasons) || value.blockReasons.some((item) => !includes(ACTION_BLOCK_REASONS, item))) {
    return { ok: false, reason: 'actionDecision.blockReasons contains an unknown code' }
  }
  const template = parseTemplate(value.template)
  if (!template.ok) return template
  const report = parseReport(value.report)
  if (!report.ok) return report

  const kind = value.kind as ActionKind
  const released = value.released
  let parameter = (value.parameter ?? null) as ActionParameter | null
  let direction = (value.direction ?? null) as ActionDirection | null
  if (kind !== 'adjust' || released !== true) {
    parameter = null
    direction = null
  }

  return {
    ok: true,
    value: {
      schemaVersion: ACTION_DECISION_SCHEMA_VERSION,
      type: ACTION_DECISION_KIND,
      kind,
      captureId: value.captureId,
      analysisId: value.analysisId,
      ruleId: value.ruleId,
      ruleVersion: value.ruleVersion,
      method: value.method,
      releaseStatus: value.releaseStatus as ActionReleaseStatus,
      released,
      productionEnabled: value.productionEnabled,
      evidenceIds: value.evidenceIds as string[],
      parameter,
      direction,
      template: template.value,
      blockReasons: value.blockReasons as ActionBlockReason[],
      audience: value.audience as ActionAudience,
      report: report.value,
    },
  }
}

export function isActionLensStatus(value: unknown): value is ActionLensStatus {
  return value === 'validated' || value === 'unvalidated' || value === 'unknown'
}
