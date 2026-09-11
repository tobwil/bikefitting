import type { BikeCalibration } from '../types/calibration.ts'
import type { AdapterSource, FitProfile, MetricCardModel, QualityReport, Recommendation } from './types.ts'

export type ResultExportPayload = {
  exportedAt: string
  localOnly: true
  upload: false
  profile: FitProfile
  quality: QualityReport
  metrics: MetricCardModel[]
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  measurementId: string | null
  calibration: BikeCalibration
  adapters: Record<string, AdapterSource>
}

export function buildResultExport(input: {
  profile: FitProfile
  quality: QualityReport | null
  metrics: MetricCardModel[]
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  measurementId?: string | null
  calibration: BikeCalibration
  adapters: Record<string, AdapterSource>
  exportedAt?: string
}): ResultExportPayload | null {
  if (!input.quality) return null
  return {
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    localOnly: true,
    upload: false,
    profile: input.profile,
    quality: input.quality,
    metrics: input.metrics,
    recommendations: input.recommendations,
    validRevs: input.validRevs,
    targetRevs: input.targetRevs,
    measurementId: input.measurementId ?? input.quality.measurementId ?? null,
    calibration: input.calibration,
    adapters: input.adapters,
  }
}

export function resultToJson(payload: ResultExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`
}

function mdRow(label: string, value: string): string {
  return `| ${label} | ${value} |\n`
}

function formatCard(card: MetricCardModel): string {
  if (card.value == null || !Number.isFinite(card.value)) return '—'
  return `${card.value.toFixed(1)}${card.unit}`
}

export function resultToMarkdown(payload: ResultExportPayload): string {
  let out = `# BikeFit Messung\n\n`
  out += 'Lokal, ohne Upload. **Kein Video. Keine Cloud. Keine produktive Ampel ohne productionEnabled.**\n\n'
  out += '| Feld | Wert |\n| --- | --- |\n'
  out += mdRow('exportiert', payload.exportedAt)
  out += mdRow('Profil', `${payload.profile.name} (\`${payload.profile.id}\`)`)
  out += mdRow('productionEnabled', payload.profile.productionEnabled ? 'ja' : 'nein')
  out += mdRow('Qualität', `${payload.quality.label} (${payload.quality.level})`)
  out += mdRow('Messung', payload.measurementId ?? '—')
  out += mdRow('gültige Umdrehungen', `${payload.validRevs} / ${payload.targetRevs}`)
  out += mdRow('verlorene Frames', String(payload.quality.lostFrames))
  out += mdRow(
    'Adapter',
    `Sessions ${payload.adapters.sessions} · Metriken ${payload.adapters.metrics} · Regeln ${payload.adapters.rules} · Soll ${payload.adapters.soll}`,
  )
  out += '\n## Qualitätshinweise\n\n'
  if (payload.quality.notes.length === 0) {
    out += '- keine\n'
  } else {
    for (const note of payload.quality.notes) {
      out += `- ${note}\n`
    }
  }
  out += '\n## Metriken\n\n| Karte | Wert | Band |\n| --- | --- | --- |\n'
  for (const card of payload.metrics) {
    out += `| ${card.label} | ${formatCard(card)} | ${card.band} |\n`
  }
  out += '\n## Empfehlung (§10.4)\n\n'
  if (payload.recommendations.length === 0) {
    out += 'Keine Empfehlung.\n'
  } else {
    const ranked = [...payload.recommendations].sort((a, b) => a.priority - b.priority)
    for (const item of ranked) {
      out += `### ${item.priority}. ${item.title}\n\n${item.reason}\n\n`
    }
  }
  return out
}
