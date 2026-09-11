import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { CycleProgress } from '../components/CycleProgress.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { AmpelNotice } from '../components/AmpelNotice.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function MeasureScreen() {
  const flow = useFlow()
  const { phase, validRevs, targetRevs, cards, startCountdown, finish } = flow.measure
  const canFinish = phase === 'recording' || phase === 'finished'
  return (
    <div className="flow-screen" data-screen="measure">
      <section className="module-slot">
        <p className="kicker">05 · Messung</p>
        <h2>Ist + Soll, drei Karten</h2>
        <p>
          Countdown, dann gültige Kurbelumdrehungen. Gold = Ist, gestrichelt = Soll
          {flow.adapters.soll.source !== 'module' ? ' (STUB)' : ''}.
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
            <small>{flow.adapters.metrics.source}</small>
          </div>
          <div className="slot-soll">
            <span className="kicker">Soll</span>
            <strong>{flow.adapters.soll.source === 'module' ? 'Modul' : 'Stub'}</strong>
            <small>kein Ist-Fill</small>
          </div>
        </div>
        <AmpelNotice profile={flow.profile} />
        <CycleProgress n={validRevs} m={targetRevs} phase={phase} />
      </section>
      <section className="module-slot metric-rail">
        {cards.slice(0, 3).map((card) => (
          <MetricCard key={card.id} card={card} ampel={flow.ampel} />
        ))}
      </section>
      <div className="flow-actions">
        <button type="button" onClick={flow.back}>
          Zurück
        </button>
        <button type="button" className="is-active" disabled={phase === 'countdown'} onClick={startCountdown}>
          {phase === 'ready' ? 'Countdown, dann messen' : 'Neu zählen'}
        </button>
        <button type="button" disabled={!canFinish || validRevs < 1} onClick={() => finish()}>
          Mit {validRevs} Umdrehungen auswerten
        </button>
        {ALLOW_SYNTHETIC_FIXTURE && (
          <button type="button" data-action="demo-result" onClick={() => finish({ demo: true })}>
            {phase === 'recording' ? 'Warte auf gültige Zyklen…' : 'Demo-Auswertung'}
          </button>
        )}
      </div>
    </div>
  )
}
