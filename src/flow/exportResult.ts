import {
  RESULT_EXPORT_KIND,
  isDemoResult,
  isFileCapture,
  isSyntheticCapture,
  type MeasurementResult,
  type ResultSource,
} from '../types/result.ts'
import type { MetricCardModel } from './types.ts'

export type ResultExportPayload = {
  kind: typeof RESULT_EXPORT_KIND
  schemaVersion: number
  exportedAt: string
  localOnly: true
  upload: false
  /** File-identifiable demo flag — no browser context required. */
  demo: boolean
  /** Frozen result.source (demo | synthetic | camera | file). */
  source: ResultSource
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
    source: result.source,
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
      '**Demo-Auswertung** — nicht als Produktmessung. `demo: true` und `result.source: "demo"` im JSON; Qualität und Produktstand sind getrennte Felder.\n\n'
  }
  if (isSyntheticCapture(result) && !payload.demo) {
    out +=
      '**Synthetische Aufnahme** — keine Kameramessung. `result.source: "synthetic"` im JSON.\n\n'
  } else if (isSyntheticCapture(result) && payload.demo) {
    out += 'Aufnahme ist synthetisch (`result.provenance.capture: "synthetic"`).\n\n'
  }
  if (isFileCapture(result) && !payload.demo) {
    out += result.file?.staticCheck
      ? '**Lokales Einzelbild** — statische Prüfung, keine Mehrzyklus-Messung. `result.source: "file"`, kein Upload.\n\n'
      : '**Lokale Datei** — kein Upload. `result.source: "file"`; Zeitbereich der Mediendatei.\n\n'
  }
  out += 'Lokal, ohne Upload. **Kein Video-Upload. Keine Cloud. Keine produktive Ampel ohne productionEnabled.**\n\n'
  out += '| Feld | Wert |\n| --- | --- |\n'
  out += mdRow('exportiert', payload.exportedAt)
  out += mdRow('Quelle', payload.source)
  out += mdRow('demo', payload.demo ? 'ja' : 'nein')
  out += mdRow('Auswertung', payload.evaluation)
  out += mdRow('Aufnahme', payload.capture)
  out += mdRow('Produktstand', payload.productRelease)
  out += mdRow('Profil', `${result.profile.name} (\`${result.profile.id}\`)`)
  out += mdRow('productionEnabled', result.profile.productionEnabled ? 'ja' : 'nein')
  out += mdRow('Messung', result.quality.measurementId ?? result.id)
  out += mdRow('Ergebnis-ID', result.id)
  out += mdRow('Messfenster', `${result.time.startedAt} → ${result.time.endedAt}`)
  if (result.file) {
    out += mdRow('Datei', `${result.file.name} (${result.file.kind}, ${result.file.width}×${result.file.height})`)
    out += mdRow(
      'Medienzeit',
      `${result.file.mediaTimeRangeMs.start}–${result.file.mediaTimeRangeMs.end} ms`,
    )
    out += mdRow('Upload', 'nein')
  }
  out += mdRow(
    'Kalibrierung',
    `v${result.calibration.version} (Stand ${result.calibration.updatedAt}${
      result.calibration.binding ? `; Bindung ${result.calibration.binding.source} ${result.calibration.binding.setupId}` : ''
    })`,
  )
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
    'Module',
    `Sessions ${result.adapters.sessions} · Metriken ${result.adapters.metrics} · Regeln ${result.adapters.rules} · Soll ${result.adapters.soll}`,
  )
  const evidence = result.phaseEvidence
  if (evidence) {
    out += mdRow('Messseite', evidence.side === 'left' ? 'links' : 'rechts')
    out += mdRow('Phasenmethode', evidence.selectionMethod)
    out += mdRow(
      'Phasenbilder',
      evidence.stored
        ? evidence.slots
            .map((slot) => {
              if (slot.status === 'missing') return `${slot.id}: fehlt`
              if (slot.status === 'deleted') return `${slot.id}: gelöscht`
              const angle = slot.frame ? `${slot.frame.crankAngleDeg.toFixed(1)}°` : '—'
              return `${slot.id}: ${angle} (Einzelbild)`
            })
            .join('; ')
        : 'nicht gespeichert / gelöscht',
    )
  }
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
