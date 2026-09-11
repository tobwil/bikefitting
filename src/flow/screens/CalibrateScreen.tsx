import { CalibrationPanel } from '../../calibration/index.ts'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function CalibrateScreen() {
  const fit = useFit()
  const flow = useFlow()
  return (
    <div className="flow-screen" data-screen="calibrate">
      <section className="module-slot">
        <p className="kicker">03 · Fahrrad kalibrieren</p>
        <h2>Drei Punkte auf dem Standbild</h2>
        <p>
          Ohne Fahrer, Seitenansicht. Zuerst Tretlager-Mitte (B), dann Satteloberseite (S), dann die Hand
          an den Bremsgriffen (G). Knie bleibt eine Zahl — keine farbige Bewertung.
        </p>
      </section>
      <CalibrationPanel
        data={fit.calibration.data}
        activeMark={fit.calibration.activeMark}
        setActiveMark={fit.calibration.setActiveMark}
        clearMarks={fit.calibration.clearMarks}
        save={fit.calibration.save}
        load={fit.calibration.load}
        knee={fit.calibration.knee}
      />
      <DiagnosePanel
        extra={
          <div className="btn-row">
            <button type="button" onClick={fit.calibration.applyFixtureMarks}>
              Fixture B/S/G
            </button>
            {flow.journey === 'demo' && <p className="muted">Beispielaufnahme setzt die Marken selbst.</p>}
          </div>
        }
      />
    </div>
  )
}
