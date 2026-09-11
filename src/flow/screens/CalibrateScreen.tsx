import { CalibrationPanel } from '../../calibration/index.ts'
import { ScalePanel } from '../../scale/index.ts'
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
        <h2>Kalibrieren — Prototyp oder manuell</h2>
        <p>
          Standbild, Seitenansicht. Der lokale Geometrie-Prototyp ist experimentell und keine allgemeine
          Fahrraderkennung. Auf der echten Kamera manuell setzen. <strong>Punkte passen</strong> bestätigt
          nur geprüfte Vorschläge. Ziehen korrigiert. Drei Klicks bleiben der sichere Weg.
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
        allowFixture={fit.calibration.allowFixture}
        frozen={fit.calibration.frozen}
        onToggleFreeze={fit.calibration.toggleFreeze}
        assessment={fit.calibration.assessment}
        detect={{
          session: fit.calibration.detect,
          stillImage: fit.calibration.stillImage,
          recognize: fit.calibration.recognizeBike,
          cancelRecognize: fit.calibration.cancelRecognize,
          confirmPoints: fit.calibration.confirmPoints,
          selectCandidate: fit.calibration.selectBike,
          fallbackManual: fit.calibration.fallbackManual,
          correctPoint: (id, x, y) => fit.calibration.correctDetectPoint(id, { x, y }),
        }}
      />
      <ScalePanel
        scale={fit.scale.data}
        draft={fit.scale.draft}
        placing={fit.scale.placing}
        onDraft={fit.scale.setDraft}
        onPlace={fit.scale.setPlacing}
        onStoreDraft={fit.scale.storeDraft}
        onCheck={fit.scale.runCheck}
        onClear={fit.scale.clear}
        message={fit.scale.message}
      />
      <DiagnosePanel
        extra={
          <div className="btn-row">
            {fit.calibration.allowFixture && (
              <button type="button" onClick={fit.calibration.applyFixtureMarks}>
                Fixture B/S/G
              </button>
            )}
            {flow.journey === 'demo' && <p className="muted">Beispielaufnahme setzt die Marken selbst.</p>}
          </div>
        }
      />
    </div>
  )
}
