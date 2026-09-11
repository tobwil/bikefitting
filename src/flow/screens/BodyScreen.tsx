import { PedalPanel } from '../../pedal/index.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function BodyScreen() {
  const fit = useFit()
  const flow = useFlow()
  return (
    <div className="flow-screen" data-screen="body">
      <section className="module-slot">
        <p className="kicker">04 · Körper / Pedalbezug</p>
        <h2>Kurzer Sichtcheck</h2>
        <p>Keine vollständige Marker-Session — nur die drei Dinge, ohne die die Messung leer läuft.</p>
        <ul className="check-list">
          {flow.body.map((check) => (
            <li key={check.id} className={check.ok ? 'is-ok' : undefined} data-check={check.id}>
              <span className="check-mark">{check.ok ? 'OK' : '—'}</span>
              <div>
                <strong>{check.label}</strong>
                <p>{check.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <PedalPanel
        sample={fit.pedal.sample}
        harness={fit.pedal.harness}
        runHarness={fit.pedal.runHarness}
        reset={fit.pedal.reset}
      />
      <div className="flow-actions">
        <button type="button" onClick={flow.back}>
          Zurück
        </button>
        <button type="button" onClick={flow.next}>
          Trotzdem weiter
        </button>
        <button type="button" className="is-active" disabled={!flow.bodyReady} onClick={flow.next}>
          Messung starten
        </button>
      </div>
    </div>
  )
}
