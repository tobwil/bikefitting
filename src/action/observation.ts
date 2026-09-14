import type { MetricsReport } from '../types/metrics.ts'
import type { MetricCardModel } from '../types/result.ts'

export const KNOWN_ACTION_METHODS = ['bottom_dead_center', 'cycle_mean', 'max_extension'] as const
export type KnownActionMethod = (typeof KNOWN_ACTION_METHODS)[number]

export type KneeObservation = {
  method: string | null
  valueDeg: number | null
  uncertaintyDeg: number | null
  cycles: number
  kneePresent: boolean
}

export function isKnownActionMethod(method: string | null | undefined): method is KnownActionMethod {
  return method != null && (KNOWN_ACTION_METHODS as readonly string[]).includes(method)
}

function kneeCard(cards: readonly MetricCardModel[] | undefined): MetricCardModel | undefined {
  return cards?.find((item) => item.id === 'knee_flexion' || item.id === 'kneeFlexion')
}

/**
 * Read the knee observation that ActionDecision may act on.
 * Does not coerce cycle_mean or max_extension into bottom_dead_center.
 */
export function readKneeObservation(input: {
  cards?: readonly MetricCardModel[]
  report?: MetricsReport | null
}): KneeObservation {
  const knee = input.report?.metrics.kneeFlexion
  const card = kneeCard(input.cards)
  if (knee) {
    const present = knee.quality === 'ok' && knee.degrees != null && Number.isFinite(knee.degrees.median)
    return {
      method: knee.method,
      valueDeg: present ? knee.degrees!.median : null,
      uncertaintyDeg: present ? (knee.degrees!.spread ?? null) : null,
      cycles: knee.usableCycles,
      kneePresent: present,
    }
  }
  const method = card?.method ?? null
  const value = card?.value ?? null
  const present = value != null && Number.isFinite(value)
  return {
    method,
    valueDeg: present ? value : null,
    uncertaintyDeg: card?.bandView?.spreadDeg ?? null,
    cycles: card?.usableCycles ?? 0,
    kneePresent: present,
  }
}
