import type { MarkerlessCycle, MarkerlessReport, MotionEvidenceRef } from '../types/analysis.ts'
import { MARKERLESS_PHASE_SOURCE, MOTION_EVIDENCE_KIND } from '../types/analysis.ts'
import { median } from '../metrics/stats.ts'
import type { MarkerlessSample } from './samples.ts'

function ref(
  label: MotionEvidenceRef['label'],
  cycleIndex: number | null,
  frameIndex: number,
  mediaTimeMs: number,
  side: MotionEvidenceRef['side'],
): MotionEvidenceRef {
  const cyclePart = cycleIndex == null ? 'clip' : `cycle:${cycleIndex}`
  return {
    id: `motion:${cyclePart}:${label}:t${Math.round(mediaTimeMs)}`,
    kind: MOTION_EVIDENCE_KIND,
    phaseSource: MARKERLESS_PHASE_SOURCE,
    label,
    cycleIndex,
    frameIndex,
    mediaTimeMs,
    side,
  }
}

function representativeCycle(cycles: readonly MarkerlessCycle[]): MarkerlessCycle | null {
  const valid = cycles.filter((cycle) => cycle.valid && cycle.p10FlexionDeg != null)
  if (valid.length === 0) return null
  const mid = median(valid.map((cycle) => cycle.p10FlexionDeg!))
  let best = valid[0]!
  let bestDist = Math.abs(best.p10FlexionDeg! - mid)
  for (const cycle of valid.slice(1)) {
    const dist = Math.abs(cycle.p10FlexionDeg! - mid)
    if (dist < bestDist) {
      best = cycle
      bestDist = dist
    }
  }
  return best
}

/**
 * Motion-state evidence hooks for AP-06. Not crank-phase stills.
 * Do not emit `phase:bdc` / TDC ids from this path.
 */
export function motionEvidenceFromReport(input: {
  samples: readonly MarkerlessSample[]
  report: Pick<MarkerlessReport, 'selectedSegment' | 'cycles' | 'knee'>
}): MotionEvidenceRef[] {
  const side = input.report.knee.side
  if (!side) return []
  const out: MotionEvidenceRef[] = []
  const segment = input.report.selectedSegment
  if (segment) {
    out.push(ref('segment_start', null, segment.startIndex, segment.startMs, side))
    out.push(ref('segment_end', null, segment.endIndex, segment.endMs, side))
  }
  const chosen = representativeCycle(input.report.cycles)
  if (!chosen) return out
  out.push(ref('cycle_start', chosen.index, chosen.startIndex, chosen.startMs, side))
  out.push(ref('cycle_end', chosen.index, chosen.endIndex, chosen.endMs, side))
  if (chosen.extensionFrameIndex != null && chosen.extensionMediaTimeMs != null) {
    out.push(
      ref('near_max_extension', chosen.index, chosen.extensionFrameIndex, chosen.extensionMediaTimeMs, side),
    )
  }
  return out
}

export function evidenceIdsFromMotion(refs: readonly MotionEvidenceRef[]): string[] {
  return refs.map((item) => item.id)
}
