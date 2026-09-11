import { CalibrationPanel } from '../../calibration/index.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function CalibrateScreen() {
  const fit = useFit()
  const flow = useFlow()
  return (
    <div className="flow-screen" data-screen="calibrate">
      <section className="module-slot">
        <p className="kicker">03 · Fahrrad kalibrieren</p>
        <h2>B / S / G auf der Bühne</h2>
        <p>
          Aktive Marke setzen, dann in die Bühne klicken. Ursprung B, x vorwärts, y oben.
          Knie bleibt eine Zahl — keine Ampel.
        </p>
      </section>
      <CalibrationPanel
        data={fit.calibration.data}
        activeMark={fit.calibration.activeMark}
        setActiveMark={fit.calibration.setActiveMark}
        clearMarks={fit.calibration.clearMarks}
        applyFixtureMarks={fit.calibration.applyFixtureMarks}
        save={fit.calibration.save}
        load={fit.calibration.load}
        knee={fit.calibration.knee}
      />
      <div className="flow-actions">
        <button type="button" onClick={flow.back}>
          Zurück
        </button>
        <button type="button" className="is-active" disabled={!flow.calibrateReady} onClick={flow.next}>
          Weiter zum Körperbezug
        </button>
      </div>
    </div>
  )
}
