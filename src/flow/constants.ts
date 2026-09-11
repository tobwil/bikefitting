/** P0 product journey — keep in sync with FLOW_STATUS.md */

export const TARGET_VALID_REVS = 10
export const MIN_DEMO_REVS = 3
export const COUNTDOWN_SECONDS = 3
export const MAX_LIVE_METRIC_CARDS = 3
export const SESSIONS_STORAGE_KEY = 'bikefit.sessions.v1'

export const FLOW_STEPS = [
  'start',
  'camera',
  'calibrate',
  'body',
  'measure',
  'result',
] as const

export type FlowStepId = (typeof FLOW_STEPS)[number]

export const FLOW_STEP_META: Record<
  FlowStepId,
  { n: number; kicker: string; title: string }
> = {
  start: { n: 1, kicker: 'Start', title: 'Messung wählen' },
  camera: { n: 2, kicker: 'Kamera', title: 'Kamera einrichten' },
  calibrate: { n: 3, kicker: 'Fahrrad', title: 'Fahrrad kalibrieren B / S / G' },
  body: { n: 4, kicker: 'Bezug', title: 'Körper- und Pedalbezug' },
  measure: { n: 5, kicker: 'Messung', title: 'Live-Messung' },
  result: { n: 6, kicker: 'Ergebnis', title: 'Auswertung' },
}
