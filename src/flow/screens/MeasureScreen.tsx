import { CycleProgress } from '../components/CycleProgress.tsx'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { SOLL_GHOST_HINT } from '../sollLabel.ts'

export function MeasureScreen() {
  const flow = useFlow()
  const { phase, validRevs, targetRevs, cards } = flow.measure
  return (
    <div className="flow-screen" data-screen="measure">
      <section className="module-slot">
        <p className="kicker">05 · Messung</p>
        <h2>Treten, nicht auf den Bildschirm schauen</h2>
        <p>
          Countdown mit Ton am Anfang und am Ende. Gold = Ist. Gestrichelt = {SOLL_GHOST_HINT} Abbrechen
          und erneut versuchen geht jederzeit.
        </p>
        <div className="skeleton-slots">
          <div className="slot-ist">
            <span className="kicker">Ist</span>
            <strong>Live</strong>
            <small>aktuelle Haltung</small>
          </div>
          <div className="slot-soll">
            <span className="kicker">Aktuelles Setup</span>
            <strong>Schätzung</strong>
            <small>kein Ideal-Fit</small>
          </div>
        </div>
        <CycleProgress n={validRevs} m={targetRevs} phase={phase} />
      </section>
      <section className="module-slot metric-rail">
        {cards.slice(0, 3).map((card) => (
          <MetricCard key={card.id} card={card} ampel={flow.ampel} />
        ))}
      </section>
      <DiagnosePanel />
    </div>
  )
}
