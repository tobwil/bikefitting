import { PedalPanel } from '../../pedal/index.ts'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
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
        <p>Drei Dinge, ohne die die Messung leer läuft. Pedalmarker auswählen, sobald die Person erkannt ist.</p>
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
        <div className="flow-rail-actions">
          <button type="button" onClick={flow.next}>
            Trotzdem weiter
          </button>
        </div>
      </section>
      <DiagnosePanel
        extra={
          <PedalPanel
            sample={fit.pedal.sample}
            harness={fit.pedal.harness}
            runHarness={fit.pedal.runHarness}
            reset={fit.pedal.reset}
          />
        }
      />
    </div>
  )
}
