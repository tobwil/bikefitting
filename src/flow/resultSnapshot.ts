import type { MeasurementResult } from '../types/result.ts'
import { buildMeasurementResult, cloneJson, savedFromResult } from './buildResult.ts'
import { buildResultExport } from './exportResult.ts'
import type { JourneyKind, SavedSession } from './types.ts'

export { cloneJson } from './buildResult.ts'
export { frozenResultSource } from '../types/result.ts'

/** Recording end: one immutable dataset. Live setup after this is ignored. */
export function freezeOnComplete(
  input: Parameters<typeof buildMeasurementResult>[0],
): MeasurementResult {
  return buildMeasurementResult(input)
}

/**
 * openSaved restore. Returns the stored result (cloned) plus journey from the
 * frozen source — does not copy calibration into the live FitSession.
 */
export function restoreOpenSaved(row: SavedSession): {
  result: MeasurementResult
  journey: JourneyKind
} {
  const result = cloneJson(row.result)
  const journey: JourneyKind =
    result.source === 'demo' || result.provenance.evaluation === 'demo'
      ? 'demo'
      : result.source === 'file' || result.provenance.capture === 'file'
        ? 'file'
        : 'camera'
  return { result, journey }
}

/** Display / save / export read only this object. */
export function snapshotForExport(result: MeasurementResult, exportedAt?: string) {
  return buildResultExport(cloneJson(result), exportedAt)
}

export function snapshotForResave(
  result: MeasurementResult,
  meta?: { id?: string; title?: string; createdAt?: string; updatedAt?: string },
): SavedSession {
  return savedFromResult(result, meta)
}
