import { MetricCard } from '../components/MetricCard.tsx'
import { metricCardFixtures } from '../../rules/cardFixtures.ts'

export function CardVisualScreen() {
  return (
    <div className="app" data-mode="flow" data-screen="card-visual">
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">BikeFit Mac</span>
          <span className="gate">Karten · visuell</span>
        </div>
        <p className="mast-note">
          Zielband und IQR aus unseren Regelprofilen. Keine fremden Festwert-Tabellen. Keine
          produktive Ampel ohne productionEnabled.
        </p>
      </header>
      <main className="card-visual-main">
        <div className="rules-card-gallery" data-area="metric-card-gallery">
          {metricCardFixtures().map((item) => (
            <figure key={item.id} data-fixture={item.id}>
              <figcaption>{item.title}</figcaption>
              <MetricCard card={item.card} ampel={item.ampel} />
            </figure>
          ))}
        </div>
      </main>
    </div>
  )
}
