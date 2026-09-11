import { RESULT_EXPORT_KIND, isDemoResult, type MeasurementResult } from '../types/result.ts'
import type { MetricCardModel } from './types.ts'

export type ResultExportPayload = {
  kind: typeof RESULT_EXPORT_KIND
  schemaVersion: number
  exportedAt: string
  localOnly: true
  upload: false
  /** File-identifiable demo flag — no browser context required. */
  demo: boolean
  productRelease: string
  evaluation: MeasurementResult['provenance']['evaluation']
  capture: MeasurementResult['provenance']['capture']
  result: MeasurementResult
}

export function buildResultExport(
  result: MeasurementResult,
  exportedAt = new Date().toISOString(),
): ResultExportPayload {
  return {
    kind: RESULT_EXPORT_KIND,
    schemaVersion: result.schemaVersion,
    exportedAt,
    localOnly: true,
    upload: false,
    demo: isDemoResult(result),
    productRelease: result.provenance.productRelease,
    evaluation: result.provenance.evaluation,
    capture: result.provenance.capture,
    result,
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
  const result = payload.result
  let out = `# BikeFit Messung\n\n`
  if (payload.demo) {
    out +=
      '**Demo-Auswertung** — nicht als Produktmessung. `demo: true` im JSON; Qualität und Produktstand sind getrennte Felder.\n\n'
  }
  out += 'Lokal, ohne Upload. **Kein Video. Keine Cloud. Keine produktive Ampel ohne productionEnabled.**\n\n'
  out += '| Feld | Wert |\n| --- | --- |\n'
  out += mdRow('exportiert', payload.exportedAt)
  out += mdRow('demo', payload.demo ? 'ja' : 'nein')
  out += mdRow('Auswertung', payload.evaluation)
  out += mdRow('Aufnahme', payload.capture)
  out += mdRow('Produktstand', payload.productRelease)
  out += mdRow('Profil', `${result.profile.name} (\`${result.profile.id}\`)`)
  out += mdRow('productionEnabled', result.profile.productionEnabled ? 'ja' : 'nein')
  out += mdRow('Messung', result.quality.measurementId ?? result.id)
  out += mdRow('Messfenster', `${result.time.startedAt} → ${result.time.endedAt}`)
  out += mdRow('Kalibrierung', `v${result.calibration.version} (Stand ${result.calibration.updatedAt})`)
  out += mdRow(
    'Regelprofile',
    result.ruleVersions.length === 0
      ? '—'
      : result.ruleVersions.map((rule) => `${rule.id} (${rule.status})`).join(', '),
  )
  out += mdRow('Methode', `${result.method.metrics}; ${result.method.rules}`)
  out += mdRow('Qualität', `${result.quality.label} (${result.quality.level})`)
  out += mdRow('gültige Umdrehungen', `${result.validRevs} / ${result.targetRevs}`)
  out += mdRow('verlorene Frames', String(result.quality.lostFrames))
  out += mdRow(
    'Adapter',
    `Sessions ${result.adapters.sessions} · Metriken ${result.adapters.metrics} · Regeln ${result.adapters.rules} · Soll ${result.adapters.soll}`,
  )
  out += '\n## Qualitätshinweise\n\n'
  if (result.quality.notes.length === 0) {
    out += '- keine\n'
  } else {
    for (const note of result.quality.notes) {
      out += `- ${note}\n`
    }
  }
  out += '\n## Metriken\n\n| Karte | Wert | Band |\n| --- | --- | --- |\n'
  for (const card of result.metrics) {
    out += `| ${card.label} | ${formatCard(card)} | ${card.band} |\n`
  }
  out += '\n## Empfehlung (§10.4)\n\n'
  if (result.recommendations.length === 0) {
    out += 'Keine Empfehlung.\n'
  } else {
    const ranked = [...result.recommendations].sort((a, b) => a.priority - b.priority)
    for (const item of ranked) {
      out += `### ${item.priority}. ${item.title}\n\n${item.reason}\n\n`
    }
  }
  return out
}
