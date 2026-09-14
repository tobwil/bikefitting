import type { ActionDecision } from '../types/action.ts'
import type { CaptureAsset, CaptureType } from '../types/capture.ts'
import type { MeasurementResult } from '../types/result.ts'
import type { ObservationReport } from '../types/observation.ts'
import type {
  CaptureSetupFingerprint,
  ChangeDirection,
  ChangeDocumentSource,
  DocumentedChange,
  ObservationSnapshot,
} from '../types/change.ts'
import { DOCUMENTED_CHANGE_KIND, DOCUMENTED_CHANGE_SCHEMA_VERSION } from '../types/change.ts'
import type { LastSuccessfulCamera } from '../capture/preferredCamera.ts'
import { actionFromMeasurementResult, presentActionDecision } from '../action/present.ts'
import { newChangeId } from './ids.ts'
import { emptySetup, setupFromSources } from './setup.ts'

function kneeFrom(observation: ObservationReport | null | undefined) {
  return observation?.metrics.find((item) => item.id === 'knee_flexion' || item.id === 'kneeFlexion')
}

function trimNote(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ''
  return text.length > 0 ? text.slice(0, 240) : null
}

export function snapshotFromResult(
  result: MeasurementResult,
  extras: {
    asset?: Pick<CaptureAsset, 'captureType' | 'width' | 'height'> | null
    camera?: LastSuccessfulCamera | null
    setup?: CaptureSetupFingerprint | null
    captureType?: CaptureType | null
  } = {},
): ObservationSnapshot {
  const action = result.actionDecision
    ? presentActionDecision(result.actionDecision)
    : actionFromMeasurementResult(result)
  const observation: ObservationReport | null | undefined = result.observation
  const knee = kneeFrom(observation)
  const setup = extras.setup ?? setupFromSources({
    asset: extras.asset,
    observation,
    result,
    camera: extras.camera,
    captureType: extras.captureType,
  })
  return {
    resultId: result.id,
    captureId: result.captureId ?? action.captureId ?? result.id,
    analysisId: result.analysisId ?? action.analysisId ?? result.id,
    metricId: 'knee_flexion',
    method: observation?.method ?? action.method ?? knee?.method ?? null,
    methodVersion: observation?.methodVersion ?? knee?.methodVersion ?? null,
    valueDeg:
      action.report.valueDeg ??
      (knee?.available && knee.value != null && Number.isFinite(knee.value) ? knee.value : null),
    cycles: action.report.cycles ?? knee?.usableCycles ?? null,
    side: observation?.side ?? null,
    profileId: result.profile.id,
    profileReleased: action.released,
    ruleId: action.ruleId,
    targetLowDeg: action.released ? action.report.lowBoundDeg : null,
    targetHighDeg: action.released ? action.report.highBoundDeg : null,
    setup: setup ?? emptySetup(),
    actionKind: action.kind,
  }
}

export function documentSourceFor(action: ActionDecision | null | undefined): ChangeDocumentSource {
  if (action?.kind === 'adjust' && action.released && action.parameter === 'seat_height') {
    return 'action_adjust'
  }
  return 'user_path'
}

export function suggestedDirection(action: ActionDecision | null | undefined): ChangeDirection | null {
  if (action?.kind === 'adjust' && action.released && action.direction) return action.direction
  return null
}

export function createDocumentedChange(input: {
  previous: ObservationSnapshot
  direction: ChangeDirection
  noteOld?: string | null
  noteNew?: string | null
  source: ChangeDocumentSource
  createdAt?: string
  id?: string
}): DocumentedChange {
  return {
    schemaVersion: DOCUMENTED_CHANGE_SCHEMA_VERSION,
    kind: DOCUMENTED_CHANGE_KIND,
    id: input.id ?? newChangeId('chg'),
    createdAt: input.createdAt ?? new Date().toISOString(),
    parameter: 'seat_height',
    direction: input.direction,
    noteOld: trimNote(input.noteOld),
    noteNew: trimNote(input.noteNew),
    source: input.source,
    previous: input.previous,
  }
}
