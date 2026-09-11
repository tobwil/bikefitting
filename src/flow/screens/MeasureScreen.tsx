import { FootPanel } from '../../foot/index.ts'
import { CycleProgress } from '../components/CycleProgress.tsx'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { useFit } from '../../shell/FitSession.tsx'
import { SOLL_GHOST_HINT } from '../sollLabel.ts'
import { staticCheckQualityNote } from '../../file/staticCheck.ts'

export function MeasureScreen() {
  const flow = useFlow()
  const fit = useFit()
  const { phase, validRevs, targetRevs, cards } = flow.measure
  const staticCheck = fit.camera.staticCheck
  return (
    <div className="flow-screen" data-screen="measure">
      <section className="module-slot">
        <p className="kicker">05 · Messung</p>
        <h2>{staticCheck ? 'Statische Prüfung' : 'Treten, nicht auf den Bildschirm schauen'}</h2>
        <p>
          {staticCheck
            ? staticCheckQualityNote()
            : `Countdown mit Ton am Anfang und am Ende. Gold = Ist. ${SOLL_GHOST_HINT} Abbrechen und erneut versuchen geht jederzeit.`}
        </p>
        <div className="posture-warn">
          <p>
            <strong>Nicht zum Laptop/Bildschirm schauen.</strong> Blick auf den Monitor ändert Kopf
            und Rumpf — die Haltung ist dann nicht die Fahrhaltung. Es gibt keine automatische
            Erkennung dafür; Segmente deshalb nicht verwerfen, sondern den Blick zur Fahrtrichtung
            halten.
          </p>
        </div>
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
        {!staticCheck && <CycleProgress n={validRevs} m={targetRevs} phase={phase} />}
      </section>
      <section className="module-slot metric-rail">
        {cards.slice(0, 3).map((card) => (
          <MetricCard key={card.id} card={card} ampel={flow.ampel} />
        ))}
      </section>
      <FootPanel diagnostic={fit.foot.diagnostic} />
      <DiagnosePanel />
    </div>
  )
}
