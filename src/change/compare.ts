import type {
  ChangeComparison,
  ChangeIncompatibilityReason,
  CompatibilityFlags,
  DocumentedChange,
  ObservationSnapshot,
} from '../types/change.ts'
import {
  CHANGE_COMPARISON_KIND,
  CHANGE_COMPARISON_SCHEMA_VERSION,
  REPEATABILITY_BAND_DEG,
} from '../types/change.ts'
import { CHANGE_COPY, assertSafeChangeCopy, directionLabel } from './copy.ts'
import { newChangeId } from './ids.ts'
import { diffSetup } from './setup.ts'

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

export function compatibilityOf(
  before: ObservationSnapshot,
  after: ObservationSnapshot,
): CompatibilityFlags {
  const reasons: ChangeIncompatibilityReason[] = []
  const method = Boolean(before.method && after.method && before.method === after.method)
  const methodVersion = Boolean(
    before.methodVersion && after.methodVersion && before.methodVersion === after.methodVersion,
  )
  const metric = before.metricId === after.metricId && after.metricId === 'knee_flexion'
  const profile =
    Boolean(before.ruleId && after.ruleId && before.ruleId === after.ruleId) ||
    (before.ruleId == null && after.ruleId == null && before.profileId === after.profileId)
  const side = Boolean(before.side && after.side && before.side === after.side) || (!before.side && !after.side)
  const setupDiff = diffSetup(before.setup, after.setup)
  if (!method) reasons.push('method_mismatch')
  if (!methodVersion) reasons.push('method_version_mismatch')
  if (!metric) reasons.push('metric_mismatch')
  if (!profile) reasons.push('profile_mismatch')
  if (!side) reasons.push('side_mismatch')
  reasons.push(...setupDiff.reasons)
  const hasValues =
    before.valueDeg != null &&
    after.valueDeg != null &&
    Number.isFinite(before.valueDeg) &&
    Number.isFinite(after.valueDeg)
  if (!hasValues) reasons.push('missing_value')
  return {
    method,
    methodVersion,
    metric,
    profile,
    setup: setupDiff.setup,
    side,
    camera: setupDiff.camera,
    lens: setupDiff.lens,
    reasons: unique(reasons),
  }
}

export function isComparable(flags: CompatibilityFlags): boolean {
  return (
    flags.method &&
    flags.methodVersion &&
    flags.metric &&
    flags.side &&
    flags.setup &&
    flags.camera &&
    flags.lens &&
    !flags.reasons.includes('missing_value')
  )
}

function reasonText(reasons: readonly ChangeIncompatibilityReason[]): string {
  const parts: string[] = []
  if (reasons.includes('method_mismatch') || reasons.includes('method_version_mismatch')) {
    parts.push('Methode oder Methodenversion stimmen nicht überein. BDC und größte Streckung sind nicht dieselbe Messung.')
  }
  if (reasons.includes('side_mismatch')) parts.push('Messseite ist nicht dieselbe.')
  if (reasons.includes('camera_changed') || reasons.includes('geometry_changed') || reasons.includes('lens_changed')) {
    parts.push(CHANGE_COPY.cameraNotBody)
  }
  if (reasons.includes('missing_value')) parts.push('Ein Wert fehlt — kein Zahlenvergleich.')
  if (reasons.includes('profile_mismatch')) {
    parts.push('Regelprofil ist nicht dasselbe; ein Zielband wird nicht übertragen.')
  }
  return parts.join(' ') || CHANGE_COPY.notComparable
}

function targetNote(before: ObservationSnapshot, after: ObservationSnapshot, comparable: boolean): string | null {
  if (!comparable) return null
  if (!before.profileReleased || !after.profileReleased) return null
  if (before.ruleId !== after.ruleId) return null
  const low = after.targetLowDeg
  const high = after.targetHighDeg
  const value = after.valueDeg
  if (low == null || high == null || value == null) return null
  if (value >= low && value <= high) return CHANGE_COPY.targetBandReached
  return CHANGE_COPY.targetBandMissed
}

export function compareDocumentedChange(input: {
  change: DocumentedChange
  after: ObservationSnapshot
  createdAt?: string
  id?: string
}): ChangeComparison {
  const before = input.change.previous
  const flags = compatibilityOf(before, input.after)
  const comparable = isComparable(flags)
  const beforeDeg = before.valueDeg
  const afterDeg = input.after.valueDeg
  const deltaDeg =
    comparable && beforeDeg != null && afterDeg != null ? afterDeg - beforeDeg : null
  const band = REPEATABILITY_BAND_DEG
  let verdict: ChangeComparison['verdict'] = 'not_comparable'
  let headline: string = CHANGE_COPY.notComparable
  let detail: string = reasonText(flags.reasons)
  if (comparable && deltaDeg != null) {
    if (Math.abs(deltaDeg) <= band) {
      verdict = 'no_secure_change'
      headline = CHANGE_COPY.noSecureChange
      detail = `${CHANGE_COPY.sameMethod} Differenz ${formatDelta(deltaDeg)} bei Band ±${band}°. ${CHANGE_COPY.repeatabilityNote}`
    } else {
      verdict = 'measurable_delta'
      headline = CHANGE_COPY.measurableDelta
      detail = `${CHANGE_COPY.sameMethod} ${beforeDeg!.toFixed(1)}° → ${afterDeg!.toFixed(1)}° (${formatDelta(deltaDeg)}). Dokumentiert: ${directionLabel(input.change.direction)}. ${CHANGE_COPY.repeatabilityNote}`
    }
  } else if (flags.method && (flags.reasons.includes('camera_changed') || flags.reasons.includes('lens_changed') || flags.reasons.includes('geometry_changed'))) {
    detail = `${CHANGE_COPY.notComparable}. ${CHANGE_COPY.cameraNotBody}`
  }

  const comparison: ChangeComparison = {
    schemaVersion: CHANGE_COMPARISON_SCHEMA_VERSION,
    kind: CHANGE_COMPARISON_KIND,
    id: input.id ?? newChangeId('cmp'),
    createdAt: input.createdAt ?? new Date().toISOString(),
    changeId: input.change.id,
    previous: before,
    next: input.after,
    documentedChange: {
      id: input.change.id,
      parameter: input.change.parameter,
      direction: input.change.direction,
      noteOld: input.change.noteOld,
      noteNew: input.change.noteNew,
      source: input.change.source,
    },
    compatibility: flags,
    comparable,
    metricId: 'knee_flexion',
    method: comparable ? before.method : null,
    methodVersion: comparable ? before.methodVersion : null,
    beforeDeg: comparable ? beforeDeg : beforeDeg,
    afterDeg: comparable ? afterDeg : afterDeg,
    deltaDeg,
    repeatabilityBandDeg: band,
    verdict,
    headline,
    detail,
    targetBandNote: targetNote(before, input.after, comparable),
  }
  assertSafeChangeCopy(comparison.headline, 'comparison.headline')
  assertSafeChangeCopy(comparison.detail, 'comparison.detail')
  if (comparison.targetBandNote) assertSafeChangeCopy(comparison.targetBandNote, 'comparison.targetBandNote')
  return comparison
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}°`
}
