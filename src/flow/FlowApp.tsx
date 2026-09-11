import { CameraPanel } from '../camera/index.ts'
import { CalibrationPanel } from '../calibration/index.ts'
import { GATE } from '../config/defaults.ts'
import { PedalPanel } from '../pedal/index.ts'
import { PoseOverlay } from '../pose/index.ts'
import { AppShell } from '../shell/AppShell.tsx'
import { useFit } from '../shell/FitSession.tsx'
import { Stage } from '../shell/Stage.tsx'
import { FLOW_STEP_META } from './constants.ts'
import { useFlow } from './FlowProvider.tsx'
import { Countdown } from './components/Countdown.tsx'
import { CycleProgress } from './components/CycleProgress.tsx'
import { Stepper } from './components/Stepper.tsx'
import { BodyScreen } from './screens/BodyScreen.tsx'
import { CalibrateScreen } from './screens/CalibrateScreen.tsx'
import { CameraScreen } from './screens/CameraScreen.tsx'
import { MeasureScreen } from './screens/MeasureScreen.tsx'
import { ResultScreen } from './screens/ResultScreen.tsx'
import { StartScreen } from './screens/StartScreen.tsx'

function LabView({ onBack }: { onBack: () => void }) {
  const fit = useFit()
  return (
    <AppShell
      mode="lab"
      gate={GATE}
      note="Gate A Labor — alle Module parallel. Produktfluss über UI-Flow."
      chrome={
        <div className="lab-escape">
          <button type="button" onClick={onBack}>
            Zurück zum Produktfluss
          </button>
        </div>
      }
      stage={<Stage />}
      camera={
        <CameraPanel
          status={fit.camera.status}
          start={fit.camera.start}
          stop={fit.camera.stop}
          restart={fit.camera.restart}
          startSynthetic={fit.camera.startSynthetic}
        />
      }
      pose={
        <PoseOverlay
          workerStatus={fit.pose.workerStatus}
          workerError={fit.pose.workerError}
          inferenceMs={fit.pose.inferenceMs}
          nearSide={fit.pose.nearSide}
          frameSync={fit.pose.frameSync}
          engine={fit.pose.frame?.engine ?? '—'}
        />
      }
      calibration={
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
      }
      pedal={
        <PedalPanel
          sample={fit.pedal.sample}
          harness={fit.pedal.harness}
          runHarness={fit.pedal.runHarness}
          reset={fit.pedal.reset}
        />
      }
    />
  )
}

function railForStep(step: ReturnType<typeof useFlow>['step']) {
  switch (step) {
    case 'camera':
      return <CameraScreen />
    case 'calibrate':
      return <CalibrateScreen />
    case 'body':
      return <BodyScreen />
    case 'measure':
      return <MeasureScreen />
    case 'result':
      return <ResultScreen />
    default:
      return null
  }
}

function emptyHint(step: ReturnType<typeof useFlow>['step']): string {
  if (step === 'camera') return 'Start oder Synthetic in der Schiene. Kein Mikrofon.'
  if (step === 'calibrate') return 'Kamera läuft? Dann B, S und G in die Bühne setzen.'
  if (step === 'body') return 'Ist-Skelett und Pedalmarker prüfen.'
  if (step === 'measure') return 'Countdown starten, sobald die Bühne live ist.'
  if (step === 'result') return 'Letzter Frame bleibt stehen — oder gespeicherte Messung ohne Kamera.'
  return 'Seitenansicht des Fahrers.'
}

export function FlowApp() {
  const flow = useFlow()

  if (flow.mode === 'lab') {
    return <LabView onBack={() => flow.setMode('flow')} />
  }

  if (flow.step === 'start') {
    return (
      <div className="app" data-mode="flow" data-flow-step="start">
        <header className="mast">
          <div className="mast-brand">
            <span className="wordmark">BikeFit Mac</span>
            <span className="gate">P0 / UI-Flow</span>
          </div>
          <p className="mast-note">Lokal. Chrome. Keine Konten. Kein Upload.</p>
        </header>
        <StartScreen />
      </div>
    )
  }

  const meta = FLOW_STEP_META[flow.step]
  return (
    <AppShell
      mode="flow"
      step={flow.step}
      gate="P0 / UI-Flow"
      note={`${meta.n} · ${meta.title}. Lokal, ohne Cloud.`}
      chrome={
        <Stepper
          current={flow.step}
          onSelect={(id) => {
            if (id === 'start') flow.goTo('start')
            else flow.goTo(id)
          }}
        />
      }
      stage={<Stage emptyHint={emptyHint(flow.step)} />}
      stageOverlay={
        flow.step === 'measure' ? (
          <div className="stage-hud">
            <p className="overlay-legend">
              <span className="lg-ist">Ist</span>
              <span className="lg-soll">Soll{flow.adapters.soll.source !== 'module' ? ' STUB' : ''}</span>
            </p>
            <Countdown phase={flow.measure.phase} count={flow.measure.countdown} />
            {flow.measure.phase !== 'idle' && flow.measure.phase !== 'countdown' && (
              <CycleProgress
                n={flow.measure.validRevs}
                m={flow.measure.targetRevs}
                phase={flow.measure.phase}
              />
            )}
          </div>
        ) : null
      }
      rail={railForStep(flow.step)}
    />
  )
}
