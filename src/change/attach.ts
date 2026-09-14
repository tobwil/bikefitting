import { CHANGE_LINK_KIND, CHANGE_LINK_SCHEMA_VERSION, type ChangeLink, type DocumentedChange } from '../types/change.ts'
import type { MeasurementResult } from '../types/result.ts'
import { compareDocumentedChange } from './compare.ts'
import type { ObservationSnapshot } from '../types/change.ts'

export function attachChangeLoop(input: {
  pending: DocumentedChange
  afterResult: MeasurementResult
  afterSnapshot: ObservationSnapshot
}): MeasurementResult {
  if (input.afterSnapshot.captureId === input.pending.previous.captureId) {
    return input.afterResult
  }
  const comparison = compareDocumentedChange({
    change: input.pending,
    after: input.afterSnapshot,
  })
  const changeLink: ChangeLink = {
    schemaVersion: CHANGE_LINK_SCHEMA_VERSION,
    kind: CHANGE_LINK_KIND,
    previousResultId: input.pending.previous.resultId,
    previousCaptureId: input.pending.previous.captureId,
    previousAnalysisId: input.pending.previous.analysisId,
    nextCaptureId: input.afterSnapshot.captureId,
    nextAnalysisId: input.afterSnapshot.analysisId,
    documentedChange: input.pending,
    comparison,
  }
  return { ...input.afterResult, changeLink }
}
