import type { ActionKind } from '../types/action.ts'
import type { ObservationReport } from '../types/observation.ts'

/**
 * Document path is optional except after a released `adjust`.
 * keep / review / retake keep their existing primary actions.
 */
export function canDocumentChange(input: {
  entryPath: 'beginner' | 'expert'
  kind: ActionKind
  captureId: string | null | undefined
  observation?: ObservationReport | null
  releasedAdjust: boolean
}): boolean {
  if (input.entryPath !== 'beginner') return false
  if (!input.captureId) return false
  if (input.kind === 'retake') return false
  if (input.observation?.stub && input.observation.status !== 'usable') return false
  if (input.kind === 'adjust') return true
  if (input.kind === 'keep' || input.kind === 'review') return true
  return input.releasedAdjust
}

export function documentPathProminent(kind: ActionKind, releasedAdjust: boolean): boolean {
  return kind === 'adjust' && releasedAdjust
}
