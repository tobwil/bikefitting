import { isDemoResult } from '../types/result.ts'
import {
  METRIC_KEYS,
  SESSION_EXPORT_KIND,
  SESSION_SCHEMA_VERSION,
  type MeasurementSession,
  type SessionComparison,
  type SessionExportEnvelope,
  type SessionMetrics,
} from '../types/session.ts'
import { compareSessionPhase } from './compare.ts'

export function formatMetricValue(key: keyof SessionMetrics, value: number | null): string {
  if (value === null) return '—'
  if (key === 'kneeFlexionDeg' || key === 'crankAngleDeg') return `${value.toFixed(1)}°`
  if (key === 'pedalPhase01') return value.toFixed(3)
  if (key === 'inferenceMs') return `${value.toFixed(1)} ms`
  return String(value)
}

export function metricLabel(key: keyof SessionMetrics): string {
  switch (key) {
    case 'kneeFlexionDeg':
      return 'Knee flexion'
    case 'crankAngleDeg':
      return 'Crank angle'
    case 'pedalPhase01':
      return 'Pedal phase'
    case 'pedalRevolutions':
      return 'Pedal revolutions'
    case 'inferenceMs':
      return 'Inference'
  }
}

export function sessionFilename(session: MeasurementSession, ext: 'json' | 'md'): string {
  const stamp = session.capturedAt.replace(/[:.]/g, '-').slice(0, 19)
  const bike = session.conditions.bike.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 24)
  return `bikefit-session-${bike || 'unnamed'}-${stamp}.${ext}`
}

export function sessionsExportFilename(ext: 'json' | 'md'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `bikefit-sessions-${stamp}.${ext}`
}

export function sessionToJson(session: MeasurementSession): string {
  return `${JSON.stringify(session, null, 2)}\n`
}

export function sessionsToExportJson(sessions: MeasurementSession[], exportedAt = new Date().toISOString()): string {
  const envelope: SessionExportEnvelope = {
    kind: SESSION_EXPORT_KIND,
    schemaVersion: SESSION_SCHEMA_VERSION,
    exportedAt,
    sessions,
  }
  return `${JSON.stringify(envelope, null, 2)}\n`
}

function mdRow(label: string, value: string): string {
  return `| ${label} | ${value} |\n`
}

export function sessionToMarkdown(session: MeasurementSession): string {
  const title = session.label.trim() || session.id
  const demo = isDemoResult(session.result)
  let out = `# BikeFit session — ${title}\n\n`
  if (demo) {
    out +=
      '**Demo-Auswertung** — not a product measurement. `result.provenance.evaluation` is `demo` in the JSON.\n\n'
  }
  out += 'Local structured measurement. **No video. No cloud upload. No Ampel scoring.**\n\n'
  out += '| Field | Value |\n| --- | --- |\n'
  out += mdRow('id', session.id)
  out += mdRow('schema', `v${session.schemaVersion}`)
  out += mdRow('demo', demo ? 'yes' : 'no')
  if (session.result) {
    out += mdRow('source', session.result.source)
    out += mdRow('evaluation', session.result.provenance.evaluation)
    out += mdRow('capture', session.result.provenance.capture)
    out += mdRow('product release', session.result.provenance.productRelease)
  }
  out += mdRow('captured', session.capturedAt)
  out += mdRow('created', session.createdAt)
  out += mdRow('updated', session.updatedAt)
  out += mdRow('bike', session.conditions.bike || '—')
  out += mdRow('side', session.conditions.side)
  out += mdRow('hand position', session.conditions.handPosition)
  out += mdRow('calibration version', String(session.conditions.calibrationVersion))
  out += '\n## Metrics\n\n| Metric | Value |\n| --- | --- |\n'
  for (const key of METRIC_KEYS) {
    out += mdRow(metricLabel(key), formatMetricValue(key, session.metrics[key]))
  }
  out += '\n## Quality\n\n| Field | Value |\n| --- | --- |\n'
  out += mdRow(
    'landmark visibility',
    session.quality.landmarkVisibility === null
      ? '—'
      : session.quality.landmarkVisibility.toFixed(3),
  )
  out += mdRow('pose engine', session.quality.poseEngine)
  out += mdRow('frame sync', session.quality.frameSync)
  out += mdRow('pedal status', session.quality.pedalStatus)
  out += mdRow('calibration ready', session.quality.calibrationReady ? 'yes' : 'no')
  if (session.result?.phaseEvidence) {
    const ev = session.result.phaseEvidence
    out += '\n## Phase stills (crank angle)\n\n'
    out += 'Single-frame evidence from one valid representative cycle. Card values are multi-cycle aggregates.\n\n'
    out += '| Phase | Status | Crank | Frame t |\n| --- | --- | --- | --- |\n'
    for (const slot of ev.slots) {
      const crank = slot.frame ? `${slot.frame.crankAngleDeg.toFixed(1)}°` : '—'
      const t = slot.frame ? `${slot.frame.timestampMs.toFixed(0)} ms` : '—'
      out += `| ${slot.id} ${slot.targetDeg}° | ${slot.status} | ${crank} | ${t} |\n`
    }
  }
  out += '\n_Quality is descriptive only — not a traffic light._\n'
  return out
}

export function comparisonToMarkdown(
  before: MeasurementSession,
  after: MeasurementSession,
  comparison: SessionComparison,
): string {
  let out = '# BikeFit before / after\n\n'
  if (comparison.restricted) {
    out += `**Comparison restricted** — conditions differ (${comparison.restrictedReasons.join(', ')}). `
    out += 'Deltas are shown but this is not a like-for-like pair.\n\n'
  } else {
    out += 'Same bike, side, hand position, and calibration version.\n\n'
  }
  out += `| | Before | After | Δ |\n| --- | --- | --- | --- |\n`
  out += `| id | ${before.id} | ${after.id} | |\n`
  out += `| captured | ${before.capturedAt} | ${after.capturedAt} | |\n`
  out += `| bike | ${before.conditions.bike} | ${after.conditions.bike} | |\n`
  out += `| side | ${before.conditions.side} | ${after.conditions.side} | |\n`
  out += `| hand | ${before.conditions.handPosition} | ${after.conditions.handPosition} | |\n`
  out += `| calibration | v${before.conditions.calibrationVersion} | v${after.conditions.calibrationVersion} | |\n`
  for (const key of METRIC_KEYS) {
    const delta = comparison.deltas[key]
    const deltaText = delta === null ? '—' : (delta > 0 ? `+${formatMetricValue(key, delta)}` : formatMetricValue(key, delta))
    out += `| ${metricLabel(key)} | ${formatMetricValue(key, before.metrics[key])} | ${formatMetricValue(key, after.metrics[key])} | ${deltaText} |\n`
  }
  const phase = compareSessionPhase(before, after)
  out += '\n## Phase images\n\n'
  if (!phase.compatible) {
    out += `**Not shown** — source/side/method/calibration must match (${phase.reasons.join(', ') || 'missing stills'}).\n`
  } else {
    out += 'Compatible source, side, method, and calibration. Stills are frozen single frames, not live overlays.\n'
  }
  if (phase.bikeChanged && phase.bikeNote) {
    out += `\n${phase.bikeNote}\n`
  }
  out += '\n_No Ampel / traffic-light scoring._\n'
  return out
}

export function sessionsToMarkdown(sessions: MeasurementSession[]): string {
  if (sessions.length === 0) return '# BikeFit sessions\n\n_No sessions._\n'
  return sessions.map((session) => sessionToMarkdown(session)).join('\n---\n\n')
}
