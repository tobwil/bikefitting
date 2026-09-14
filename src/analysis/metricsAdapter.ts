import type { AnalysisMetricsRequest, AnalysisMetricsResponse } from '../types/analysis.ts'

/**
 * AP-03 ↔ AP-05 interface.
 *
 * AP-03 produces `AnalysisMetricsRequest` after decode / pose / segment.
 * AP-05 implements `measure` and returns a versioned observation
 * (`max_extension.p10.v1` when that method exists). Until then the default
 * adapter returns `not_implemented` and leaves `observation: null`.
 *
 * Merge rules:
 * - Do not require pedal markers, B/S/G, or `MetricsFrame.pedal`.
 * - Do not silently trim `request.samples` with live `maxFrames: 900`.
 * - Do not emit ActionDecision `adjust` from this adapter (AP-10 release gate).
 * - Register by passing `{ metrics }` into `createAnalysisController`.
 */
export type AnalysisMetricsAdapter = {
  id: string
  version: string
  measure(request: AnalysisMetricsRequest): Promise<AnalysisMetricsResponse>
}

export const PENDING_AP05_ADAPTER: AnalysisMetricsAdapter = {
  id: 'ap05.pending',
  version: '0',
  async measure(request) {
    const reasons = ['ap05_not_wired']
    if (!request.selected) reasons.unshift('no_usable_pedaling')
    return {
      adapterId: this.id,
      adapterVersion: this.version,
      status: 'not_implemented',
      observation: null,
      usableCycles: null,
      reasons,
    }
  },
}
