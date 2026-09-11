import type { MetricsHarnessResult } from './harness.ts'
import type { MetricResult, MetricsReport } from '../types/metrics.ts'
import { METRIC_IDS } from '../types/metrics.ts'

export type MetricsPanelProps = {
  report?: MetricsReport
  harness?: MetricsHarnessResult | null
  runHarness?: () => void
  reset?: () => void
}

const LABELS: Record<(typeof METRIC_IDS)[number], string> = {
  kneeFlexion: 'Knee flexion',
  trunkTorso: 'Trunk / torso',
  elbow: 'Elbow flexion',
}

function formatDegrees(metric: MetricResult): string {
  if (metric.quality !== 'ok' || !metric.degrees) return '—'
  const d = metric.degrees
  return `${d.median.toFixed(1)}°`
}

function formatSpread(metric: MetricResult): string {
  if (metric.quality !== 'ok' || !metric.degrees) return '—'
  return `µ ${metric.degrees.mean.toFixed(1)} · IQR ${metric.degrees.spread.toFixed(1)} · n ${metric.degrees.n}`
}

export function MetricsPanel({
  report,
  harness = null,
  runHarness,
  reset,
}: MetricsPanelProps) {
  const valid = report?.validRevolutions ?? 0
  const candidates = report?.candidateCycles ?? 0

  return (
    <section className="module-slot" data-module="metrics">
      <header>
        <p className="kicker">Metrics · E4</p>
        <h2>
          {valid} valid rev{valid === 1 ? '' : 's'}
        </h2>
      </header>
      <p>
        Sagittal 2D knee, trunk, and elbow over locked crank cycles. Each metric
        is <code>ok</code> with numbers or <code>unavailable</code> with a
        reason — no Ampel scoring.
      </p>
      <dl className="readout compact">
        <div>
          <dt>Valid revolutions</dt>
          <dd>{valid}</dd>
        </div>
        <div>
          <dt>Candidate cycles</dt>
          <dd>{candidates}</dd>
        </div>
        {METRIC_IDS.map((id) => {
          const metric = report?.metrics[id]
          const quality = metric?.quality ?? 'unavailable'
          return (
            <div key={id} data-metric={id} data-quality={quality}>
              <dt>
                {LABELS[id]}{' '}
                <span className={quality === 'unavailable' ? 'quality-unavailable' : undefined}>
                  {quality}
                </span>
              </dt>
              <dd>{metric ? formatDegrees(metric) : '—'}</dd>
            </div>
          )
        })}
      </dl>
      {METRIC_IDS.map((id) => {
        const metric = report?.metrics[id]
        if (!metric) return null
        return (
          <p key={`${id}-meta`} className="metric-meta">
            <code>{id}</code>
            {metric.quality === 'ok' ? ` ${formatSpread(metric)}` : null}
            {metric.reasons.length > 0 ? (
              <>
                {' '}
                {metric.reasons.map((reason) => (
                  <code key={reason} className="reason-code">
                    {reason}
                  </code>
                ))}
              </>
            ) : null}
          </p>
        )
      })}
      <div className="btn-row">
        <button type="button" onClick={runHarness}>
          Metrics harness
        </button>
        <button type="button" onClick={reset}>
          Reset series
        </button>
      </div>
      {harness && (
        <p className={harness.passed ? 'ok-note' : 'status-idle'}>{harness.message}</p>
      )}
    </section>
  )
}
