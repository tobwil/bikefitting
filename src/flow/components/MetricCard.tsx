import type { MetricCardModel } from '../types.ts'

export function MetricCard({ card, ampel }: { card: MetricCardModel; ampel: boolean }) {
  const tone = ampel ? card.band : 'plain'
  const value =
    card.value === null || Number.isNaN(card.value) ? '—' : `${card.value.toFixed(1)}${card.unit}`
  return (
    <article className={`metric-card is-${tone}`} data-metric={card.id}>
      <p className="kicker">{card.label}</p>
      <h3>{value}</h3>
      <p className="metric-hint">{card.targetHint}</p>
      {card.method && (
        <p className="metric-method">
          <code>{card.method}</code>
          {` · n ${card.usableCycles}`}
        </p>
      )}
      {card.detail && <p className="metric-detail">{card.detail}</p>}
    </article>
  )
}
