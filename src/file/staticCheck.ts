import type { FileMediaKind } from '../types/file.ts'
import type { MetricsReport } from '../types/metrics.ts'

export function isStaticCheckKind(kind: FileMediaKind | null | undefined): boolean {
  return kind === 'image'
}

export function cycleMeasurementAllowed(kind: FileMediaKind | null | undefined): boolean {
  return kind !== 'image'
}

export function staticCheckQualityNote(): string {
  return 'Einzelbild — statische Prüfung, keine Mehrzyklus-Messung.'
}

export function assertNotCycleMeasurement(
  kind: FileMediaKind | null | undefined,
  report: Pick<MetricsReport, 'validRevolutions'> | null | undefined,
): { ok: boolean; reason: string } {
  if (!isStaticCheckKind(kind)) return { ok: true, reason: 'video' }
  const revs = report?.validRevolutions ?? 0
  if (revs > 0) {
    return { ok: false, reason: 'static image must not report crank cycles' }
  }
  return { ok: true, reason: 'static' }
}
