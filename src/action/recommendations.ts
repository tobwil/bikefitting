import type { Recommendation } from '../types/result.ts'
import type { ActionDecision } from '../types/action.ts'
import { beginnerSeatAction } from './decide.ts'

export function recommendationsFromAction(decision: ActionDecision): Recommendation[] {
  const recs: Recommendation[] = [
    {
      priority: 1,
      title: decision.template.what,
      reason: `${decision.template.why} ${decision.template.how}`,
      metricId: 'knee_flexion',
    },
  ]
  if (decision.kind === 'retake') {
    recs.push({
      priority: 2,
      title: 'Erneut messen',
      reason: decision.template.how,
    })
  }
  if (!decision.released && !beginnerSeatAction(decision)) {
    recs[0] = {
      ...recs[0]!,
      reason: `${recs[0]!.reason} Keine farbige Bewertung in dieser Version.`,
    }
  }
  return recs
}
