import type { ActionKind, ActionLensStatus } from '../types/action.ts'
import { ACTION_KINDS, ACTION_LENS_STATUSES } from '../types/action.ts'
import { CAPTURE_TYPES, type CaptureType } from '../types/capture.ts'
import { OBSERVATION_SIDES, type ObservationSide } from '../types/observation.ts'
import type {
  CaptureSetupFingerprint,
  ChangeComparison,
  ChangeDirection,
  ChangeDocumentSource,
  ChangeIncompatibilityReason,
  ChangeLink,
  ChangeParameter,
  ChangeVerdict,
  CompatibilityFlags,
  DocumentedChange,
  ObservationSnapshot,
} from '../types/change.ts'
import {
  CHANGE_COMPARISON_KIND,
  CHANGE_COMPARISON_SCHEMA_VERSION,
  CHANGE_DIRECTIONS,
  CHANGE_DOCUMENT_SOURCES,
  CHANGE_INCOMPATIBILITY_REASONS,
  CHANGE_LINK_KIND,
  CHANGE_LINK_SCHEMA_VERSION,
  CHANGE_PARAMETERS,
  CHANGE_VERDICTS,
  DOCUMENTED_CHANGE_KIND,
  DOCUMENTED_CHANGE_SCHEMA_VERSION,
  REPEATABILITY_BAND_DEG,
} from '../types/change.ts'
import { assertSafeChangeCopy } from './copy.ts'

export type ParseChangeResult<T> = { ok: true; value: T } | { ok: false; reason: string }

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

function parseSetup(value: unknown): ParseChangeResult<CaptureSetupFingerprint> {
  if (!isPlainObject(value)) return { ok: false, reason: 'setup must be an object' }
  if (!(value.deviceId === null || typeof value.deviceId === 'string')) {
    return { ok: false, reason: 'setup.deviceId must be a string or null' }
  }
  const kinds = ['continuity', 'mac_webcam', 'other'] as const
  if (!(value.cameraKind === null || includes(kinds, value.cameraKind))) {
    return { ok: false, reason: 'setup.cameraKind is invalid' }
  }
  if (!(value.captureType === null || includes(CAPTURE_TYPES, value.captureType))) {
    return { ok: false, reason: 'setup.captureType is invalid' }
  }
  if (!isNumberOrNull(value.width) || !isNumberOrNull(value.height) || !isNumberOrNull(value.geometryRevision)) {
    return { ok: false, reason: 'setup dimensions/revision must be numbers or null' }
  }
  if (!(value.setupId === null || typeof value.setupId === 'string')) {
    return { ok: false, reason: 'setup.setupId must be a string or null' }
  }
  if (!includes(ACTION_LENS_STATUSES, value.lensStatus)) {
    return { ok: false, reason: 'setup.lensStatus is invalid' }
  }
  if (!(value.userReportedLens === null || typeof value.userReportedLens === 'string')) {
    return { ok: false, reason: 'setup.userReportedLens must be a string or null' }
  }
  return {
    ok: true,
    value: {
      deviceId: value.deviceId,
      cameraKind: value.cameraKind,
      captureType: value.captureType as CaptureType | null,
      width: value.width,
      height: value.height,
      geometryRevision: value.geometryRevision,
      setupId: value.setupId,
      lensStatus: value.lensStatus as ActionLensStatus,
      userReportedLens: value.userReportedLens,
    },
  }
}

function parseSnapshot(value: unknown, field: string): ParseChangeResult<ObservationSnapshot> {
  if (!isPlainObject(value)) return { ok: false, reason: `${field} must be an object` }
  if (typeof value.resultId !== 'string' || typeof value.captureId !== 'string' || typeof value.analysisId !== 'string') {
    return { ok: false, reason: `${field} needs resultId, captureId, analysisId` }
  }
  if (value.metricId !== 'knee_flexion') return { ok: false, reason: `${field}.metricId must be knee_flexion` }
  if (!(value.method === null || typeof value.method === 'string')) {
    return { ok: false, reason: `${field}.method must be a string or null` }
  }
  if (!(value.methodVersion === null || typeof value.methodVersion === 'string')) {
    return { ok: false, reason: `${field}.methodVersion must be a string or null` }
  }
  if (!isNumberOrNull(value.valueDeg) || !isNumberOrNull(value.cycles)) {
    return { ok: false, reason: `${field} values must be numbers or null` }
  }
  if (!(value.side === null || includes(OBSERVATION_SIDES, value.side))) {
    return { ok: false, reason: `${field}.side is invalid` }
  }
  if (!(value.profileId === null || typeof value.profileId === 'string')) {
    return { ok: false, reason: `${field}.profileId must be a string or null` }
  }
  if (typeof value.profileReleased !== 'boolean') {
    return { ok: false, reason: `${field}.profileReleased must be a boolean` }
  }
  if (!(value.ruleId === null || typeof value.ruleId === 'string')) {
    return { ok: false, reason: `${field}.ruleId must be a string or null` }
  }
  if (!isNumberOrNull(value.targetLowDeg) || !isNumberOrNull(value.targetHighDeg)) {
    return { ok: false, reason: `${field} target bounds must be numbers or null` }
  }
  if (!includes(ACTION_KINDS, value.actionKind)) {
    return { ok: false, reason: `${field}.actionKind is invalid` }
  }
  const setup = parseSetup(value.setup)
  if (!setup.ok) return setup
  return {
    ok: true,
    value: {
      resultId: value.resultId,
      captureId: value.captureId,
      analysisId: value.analysisId,
      metricId: 'knee_flexion',
      method: value.method,
      methodVersion: value.methodVersion,
      valueDeg: value.valueDeg,
      cycles: value.cycles,
      side: value.side as ObservationSide | null,
      profileId: value.profileId,
      profileReleased: value.profileReleased,
      ruleId: value.ruleId,
      targetLowDeg: value.targetLowDeg,
      targetHighDeg: value.targetHighDeg,
      setup: setup.value,
      actionKind: value.actionKind as ActionKind,
    },
  }
}

export function parseDocumentedChange(value: unknown): ParseChangeResult<DocumentedChange | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, reason: 'documentedChange must be an object' }
  if (value.schemaVersion !== DOCUMENTED_CHANGE_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported documentedChange.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (value.kind !== DOCUMENTED_CHANGE_KIND) {
    return { ok: false, reason: 'documentedChange.kind must be bikefit.documented-change' }
  }
  if (typeof value.id !== 'string' || typeof value.createdAt !== 'string') {
    return { ok: false, reason: 'documentedChange needs id and createdAt' }
  }
  if (!includes(CHANGE_PARAMETERS, value.parameter)) {
    return { ok: false, reason: 'documentedChange.parameter must be seat_height' }
  }
  if (!includes(CHANGE_DIRECTIONS, value.direction)) {
    return { ok: false, reason: 'documentedChange.direction must be higher or lower' }
  }
  if (!(value.noteOld === null || typeof value.noteOld === 'string')) {
    return { ok: false, reason: 'documentedChange.noteOld must be a string or null' }
  }
  if (!(value.noteNew === null || typeof value.noteNew === 'string')) {
    return { ok: false, reason: 'documentedChange.noteNew must be a string or null' }
  }
  if (!includes(CHANGE_DOCUMENT_SOURCES, value.source)) {
    return { ok: false, reason: 'documentedChange.source is invalid' }
  }
  const previous = parseSnapshot(value.previous, 'documentedChange.previous')
  if (!previous.ok) return previous
  return {
    ok: true,
    value: {
      schemaVersion: DOCUMENTED_CHANGE_SCHEMA_VERSION,
      kind: DOCUMENTED_CHANGE_KIND,
      id: value.id,
      createdAt: value.createdAt,
      parameter: value.parameter as ChangeParameter,
      direction: value.direction as ChangeDirection,
      noteOld: value.noteOld,
      noteNew: value.noteNew,
      source: value.source as ChangeDocumentSource,
      previous: previous.value,
    },
  }
}

function parseFlags(value: unknown): ParseChangeResult<CompatibilityFlags> {
  if (!isPlainObject(value)) return { ok: false, reason: 'compatibility must be an object' }
  const keys = ['method', 'methodVersion', 'metric', 'profile', 'setup', 'side', 'camera', 'lens'] as const
  for (const key of keys) {
    if (typeof value[key] !== 'boolean') {
      return { ok: false, reason: `compatibility.${key} must be a boolean` }
    }
  }
  if (!Array.isArray(value.reasons) || value.reasons.some((item) => !includes(CHANGE_INCOMPATIBILITY_REASONS, item))) {
    return { ok: false, reason: 'compatibility.reasons contains an unknown code' }
  }
  return {
    ok: true,
    value: {
      method: value.method as boolean,
      methodVersion: value.methodVersion as boolean,
      metric: value.metric as boolean,
      profile: value.profile as boolean,
      setup: value.setup as boolean,
      side: value.side as boolean,
      camera: value.camera as boolean,
      lens: value.lens as boolean,
      reasons: value.reasons as ChangeIncompatibilityReason[],
    },
  }
}

export function parseChangeComparison(value: unknown): ParseChangeResult<ChangeComparison | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, reason: 'comparison must be an object' }
  if (value.schemaVersion !== CHANGE_COMPARISON_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported comparison.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (value.kind !== CHANGE_COMPARISON_KIND) {
    return { ok: false, reason: 'comparison.kind must be bikefit.change-comparison' }
  }
  if (typeof value.id !== 'string' || typeof value.createdAt !== 'string' || typeof value.changeId !== 'string') {
    return { ok: false, reason: 'comparison needs id, createdAt, changeId' }
  }
  const previous = parseSnapshot(value.previous, 'comparison.previous')
  if (!previous.ok) return previous
  const next = parseSnapshot(value.next, 'comparison.next')
  if (!next.ok) return next
  if (!isPlainObject(value.documentedChange)) {
    return { ok: false, reason: 'comparison.documentedChange must be an object' }
  }
  const documented = value.documentedChange
  if (typeof documented.id !== 'string' || !includes(CHANGE_PARAMETERS, documented.parameter) || !includes(CHANGE_DIRECTIONS, documented.direction)) {
    return { ok: false, reason: 'comparison.documentedChange is incomplete' }
  }
  if (!(documented.noteOld === null || typeof documented.noteOld === 'string')) {
    return { ok: false, reason: 'comparison.documentedChange.noteOld must be a string or null' }
  }
  if (!(documented.noteNew === null || typeof documented.noteNew === 'string')) {
    return { ok: false, reason: 'comparison.documentedChange.noteNew must be a string or null' }
  }
  if (!includes(CHANGE_DOCUMENT_SOURCES, documented.source)) {
    return { ok: false, reason: 'comparison.documentedChange.source is invalid' }
  }
  const flags = parseFlags(value.compatibility)
  if (!flags.ok) return flags
  if (typeof value.comparable !== 'boolean') return { ok: false, reason: 'comparison.comparable must be a boolean' }
  if (value.metricId !== 'knee_flexion') return { ok: false, reason: 'comparison.metricId must be knee_flexion' }
  if (!(value.method === null || typeof value.method === 'string')) {
    return { ok: false, reason: 'comparison.method must be a string or null' }
  }
  if (!(value.methodVersion === null || typeof value.methodVersion === 'string')) {
    return { ok: false, reason: 'comparison.methodVersion must be a string or null' }
  }
  if (!isNumberOrNull(value.beforeDeg) || !isNumberOrNull(value.afterDeg) || !isNumberOrNull(value.deltaDeg)) {
    return { ok: false, reason: 'comparison degrees must be numbers or null' }
  }
  if (value.repeatabilityBandDeg !== REPEATABILITY_BAND_DEG) {
    return { ok: false, reason: `comparison.repeatabilityBandDeg must be the predeclared ${REPEATABILITY_BAND_DEG}` }
  }
  if (!includes(CHANGE_VERDICTS, value.verdict)) {
    return { ok: false, reason: 'comparison.verdict is invalid' }
  }
  if (typeof value.headline !== 'string' || typeof value.detail !== 'string') {
    return { ok: false, reason: 'comparison needs headline and detail' }
  }
  if (!(value.targetBandNote === null || typeof value.targetBandNote === 'string')) {
    return { ok: false, reason: 'comparison.targetBandNote must be a string or null' }
  }
  try {
    assertSafeChangeCopy(value.headline, 'comparison.headline')
    assertSafeChangeCopy(value.detail, 'comparison.detail')
    if (value.targetBandNote) assertSafeChangeCopy(value.targetBandNote, 'comparison.targetBandNote')
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unsafe comparison copy' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: CHANGE_COMPARISON_SCHEMA_VERSION,
      kind: CHANGE_COMPARISON_KIND,
      id: value.id,
      createdAt: value.createdAt,
      changeId: value.changeId,
      previous: previous.value,
      next: next.value,
      documentedChange: {
        id: documented.id,
        parameter: documented.parameter as ChangeParameter,
        direction: documented.direction as ChangeDirection,
        noteOld: documented.noteOld,
        noteNew: documented.noteNew,
        source: documented.source as ChangeDocumentSource,
      },
      compatibility: flags.value,
      comparable: value.comparable,
      metricId: 'knee_flexion',
      method: value.method,
      methodVersion: value.methodVersion,
      beforeDeg: value.beforeDeg,
      afterDeg: value.afterDeg,
      deltaDeg: value.deltaDeg,
      repeatabilityBandDeg: REPEATABILITY_BAND_DEG,
      verdict: value.verdict as ChangeVerdict,
      headline: value.headline,
      detail: value.detail,
      targetBandNote: value.targetBandNote,
    },
  }
}

export function parseChangeLink(value: unknown): ParseChangeResult<ChangeLink | undefined> {
  if (value === undefined || value === null) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, reason: 'result.changeLink must be an object' }
  if (value.schemaVersion !== CHANGE_LINK_SCHEMA_VERSION) {
    return { ok: false, reason: `unsupported changeLink.schemaVersion ${String(value.schemaVersion)}` }
  }
  if (value.kind !== CHANGE_LINK_KIND) {
    return { ok: false, reason: 'changeLink.kind must be bikefit.change-link' }
  }
  if (
    typeof value.previousResultId !== 'string' ||
    typeof value.previousCaptureId !== 'string' ||
    typeof value.previousAnalysisId !== 'string' ||
    typeof value.nextCaptureId !== 'string' ||
    typeof value.nextAnalysisId !== 'string'
  ) {
    return { ok: false, reason: 'changeLink needs previous/next identity strings' }
  }
  const documented = parseDocumentedChange(value.documentedChange)
  if (!documented.ok) return documented
  if (!documented.value) return { ok: false, reason: 'changeLink.documentedChange is required' }
  const comparison = parseChangeComparison(value.comparison)
  if (!comparison.ok) return comparison
  if (!comparison.value) return { ok: false, reason: 'changeLink.comparison is required' }
  return {
    ok: true,
    value: {
      schemaVersion: CHANGE_LINK_SCHEMA_VERSION,
      kind: CHANGE_LINK_KIND,
      previousResultId: value.previousResultId,
      previousCaptureId: value.previousCaptureId,
      previousAnalysisId: value.previousAnalysisId,
      nextCaptureId: value.nextCaptureId,
      nextAnalysisId: value.nextAnalysisId,
      documentedChange: documented.value,
      comparison: comparison.value,
    },
  }
}
