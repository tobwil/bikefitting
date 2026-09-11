import type { MetricCardModel } from '../types.ts'
import { cardTone } from '../../rules/metricCard.ts'

function pct(value: number, start: number, span: number): number {
  return ((value - start) / span) * 100
}

function TargetBandBar({ card }: { card: MetricCardModel }) {
  const view = card.bandView
  const value = card.value
  const low = view?.targetLowDeg
  const high = view?.targetHighDeg
  const spread = view?.spreadDeg ?? 0
  const hasTarget = low != null && high != null && Number.isFinite(low) && Number.isFinite(high)
  const hasValue = value != null && Number.isFinite(value)
  if (!hasTarget && !hasValue) return null

  const points: number[] = []
  if (hasTarget) {
    points.push(low, high)
  }
  if (hasValue) {
    points.push(value - Math.max(0, spread), value + Math.max(0, spread), value)
  }
  const minP = Math.min(...points)
  const maxP = Math.max(...points)
  const pad = Math.max(6, (maxP - minP) * 0.22)
  const start = minP - pad
  const end = maxP + pad
  const span = end - start || 1

  const aria = [
    hasTarget ? `Zielband ${low.toFixed(0)} bis ${high.toFixed(0)} Grad` : 'Kein Zielband',
    hasValue ? `Messung ${value.toFixed(1)} Grad` : 'Keine Messung',
    view?.spreadDeg != null ? `IQR ${view.spreadDeg.toFixed(1)} Grad` : null,
    view?.decisionText,
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <div className="metric-band" role="img" aria-label={aria} data-has-target={hasTarget ? 'true' : 'false'}>
      <div className="metric-band-track">
        {hasTarget && (
          <span
            className="metric-band-window"
            style={{ left: `${pct(low, start, span)}%`, width: `${Math.max(pct(high, start, span) - pct(low, start, span), 1.2)}%` }}
          />
        )}
        {hasValue && spread > 0 && (
          <span
            className="metric-band-spread"
            title={view?.spreadNote}
            style={{
              left: `${pct(value - spread, start, span)}%`,
              width: `${Math.max(pct(value + spread, start, span) - pct(value - spread, start, span), 0.8)}%`,
            }}
          />
        )}
        {hasValue && <span className="metric-band-value" style={{ left: `${pct(value, start, span)}%` }} />}
      </div>
      <p className="metric-band-scale">
        <span>{hasTarget ? `${low.toFixed(0)}–${high.toFixed(0)}°` : 'kein Zielband'}</span>
        {hasValue && view?.spreadDeg != null && <span>IQR {view.spreadDeg.toFixed(1)}°</span>}
      </p>
    </div>
  )
}

export function MetricCard({ card, ampel }: { card: MetricCardModel; ampel: boolean }) {
  const tone = cardTone(card, ampel)
  const view = card.bandView
  const value =
    card.value === null || Number.isNaN(card.value) ? '—' : `${card.value.toFixed(1)}${card.unit}`
  const scoreable = view?.scoreable ?? false
  return (
    <article
      className={`metric-card is-${tone}`}
      data-metric={card.id}
      data-tone={tone}
      data-scoreable={scoreable ? 'true' : 'false'}
      data-decision={view?.decisionState ?? ''}
      data-high-spread={view?.highSpread ? 'true' : 'false'}
      data-phase={view?.phase ?? ''}
      data-sample-size={String(view?.sampleSize ?? card.usableCycles ?? 0)}
      data-profile={view?.profileId ?? ''}
    >
      <p className="kicker">{card.label}</p>
      <h3>{value}</h3>
      <TargetBandBar card={card} />
      <p className="metric-state">{view?.decisionText ?? card.targetHint}</p>
      <p className="metric-hint">{card.targetHint}</p>
      <p className="metric-meta">
        <span>n {view?.sampleSize ?? card.usableCycles ?? 0}</span>
        {view?.spreadDeg != null && <span>IQR {view.spreadDeg.toFixed(1)}°</span>}
      </p>
      {view?.definition && <p className="metric-definition">{view.definition}</p>}
      {view?.spreadDeg != null && <p className="metric-spread">{view.spreadNote}</p>}
      {!view && (card.usableCycles ?? 0) > 0 && (
        <p className="metric-cycles">{card.usableCycles} gültige Umdrehungen</p>
      )}
    </article>
  )
}
