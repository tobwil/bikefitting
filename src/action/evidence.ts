import type { PhaseEvidence } from '../types/phase.ts'

export function evidenceIdsFromPhase(
  phase: PhaseEvidence | null | undefined,
  measurementId?: string | null,
): string[] {
  const ids: string[] = []
  if (measurementId) ids.push(`measurement:${measurementId}`)
  if (!phase) return ids
  for (const slot of phase.slots) {
    if (slot.status === 'captured') ids.push(`phase:${slot.id}`)
  }
  return ids
}
