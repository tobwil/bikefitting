import { CameraPanel } from '../camera/index.ts'
import { CalibrationPanel } from '../calibration/index.ts'
import { GATE } from '../config/defaults.ts'
import { MetricsPanel } from '../metrics/index.ts'
import { PedalPanel } from '../pedal/index.ts'
import { ComparePanel, PoseOverlay } from '../pose/index.ts'
import { RulesPanel } from '../rules/index.ts'
import { SessionsPanel, averageVisibility } from '../sessions/index.ts'
import { SollPanel } from '../soll/index.ts'
import { AppShell } from '../shell/AppShell.tsx'
import { useFit } from '../shell/FitSession.tsx'
import { Stage } from '../shell/Stage.tsx'
import { FLOW_STEP_META } from './constants.ts'
import { useFlow } from './FlowProvider.tsx'
import { Countdown } from './components/Countdown.tsx'
import { CycleProgress } from './components/CycleProgress.tsx'
import { FlowPrimary } from './components/FlowPrimary.tsx'
import { Stepper } from './components/Stepper.tsx'
import { BodyScreen } from './screens/BodyScreen.tsx'
import { CalibrateScreen } from './screens/CalibrateScreen.tsx'
import { CameraScreen } from './screens/CameraScreen.tsx'
import { MeasureScreen } from './screens/MeasureScreen.tsx'
import { ResultScreen } from './screens/ResultScreen.tsx'
import { StartScreen } from './screens/StartScreen.tsx'
import { CardVisualScreen } from './screens/CardVisualScreen.tsx'
import { HelpPanel } from '../shell/HelpPanel.tsx'
import { SOLL_GHOST_LABEL } from './sollLabel.ts'
import { CaptureScreen } from '../capture/CaptureScreen.tsx'
import { CapturePrimaryBar, CaptureStageOverlay } from '../capture/CapturePrimary.tsx'
import { CaptureSessionProvider, useCaptureSession } from '../capture/CaptureSession.tsx'
import '../capture/capture.css'

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
              startFile={fit.camera.startFile}
              file={fit.camera.file}
              playback={fit.camera.playback}
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
          model={fit.pose.model}
          freshness={fit.pose.freshness}
          onRetry={() => void fit.pose.retry()}
          onSimulateLoss={fit.camera.allowSynthetic ? fit.pose.simulateLoss : undefined}
          overlayFilter={fit.pose.overlayFilter}
        />
      }
      compare={<ComparePanel />}
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
      }
      pedal={
        <PedalPanel
          sample={fit.pedal.sample}
          harness={fit.pedal.harness}
          runHarness={fit.pedal.runHarness}
          reset={fit.pedal.reset}
          selecting={fit.pedal.selecting}
          setSelecting={fit.pedal.setSelecting}
          seedPoint={fit.pedal.seedPoint}
          onReselect={() => fit.pedal.setSelecting(true)}
          lab
        />
      }
      metrics={
        <MetricsPanel
          report={fit.metrics.report}
          harness={fit.metrics.harness}
          runHarness={fit.metrics.runHarness}
          reset={fit.metrics.reset}
        />
      }
      soll={
        <SollPanel
          result={fit.soll.result}
          ui={fit.soll.ui}
          body={fit.soll.body}
          setUi={fit.soll.setUi}
          onMeasureIst={fit.soll.measureFromIst}
          onResetEstimated={fit.soll.resetEstimated}
          onRunHarness={fit.soll.runHarness}
          harness={fit.soll.harness}
          istReady={!!fit.pose.frame}
        />
      }
      rules={
        <RulesPanel
          measurement={{
            metric: 'knee_flexion',
            method: 'bottom_dead_center',
            valueDeg: fit.calibration.knee.degrees,
            uncertaintyDeg: null,
            cycles: fit.pedal.sample.revolutions,
            valid: Boolean(fit.calibration.knee.visible && fit.calibration.knee.degrees !== null),
          }}
        />
      }
      sessions={
        <SessionsPanel
          live={{
            calibrationVersion: fit.calibration.data.version,
            metrics: {
              kneeFlexionDeg: fit.calibration.knee.visible ? fit.calibration.knee.degrees : null,
              crankAngleDeg: fit.pedal.sample.crankAngleDeg,
              pedalPhase01: fit.pedal.sample.phase01,
              pedalRevolutions: fit.pedal.sample.revolutions,
              inferenceMs: fit.pose.inferenceMs,
            },
            quality: {
              landmarkVisibility: averageVisibility(fit.pose.frame?.landmarks),
              poseEngine: fit.pose.frame?.engine ?? 'none',
              frameSync: fit.pose.frameSync,
              pedalStatus: fit.pedal.sample.status,
              calibrationReady: fit.calibration.data.transform !== null,
            },
          }}
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

function emptyHint(step: ReturnType<typeof useFlow>['step'], demo: boolean): string {
  if (step === 'capture') {
    return 'iPhone oder Webcam nach dem Klick. Nach dem Speichern startet die Auswertung von allein.'
  }
  if (step === 'camera') {
    return demo
      ? 'Beispielaufnahme läuft. Weiter, sobald das Bild steht.'
      : 'Kamera starten, wenn die Seitenansicht steht. Kein Mikrofon.'
  }
  if (step === 'calibrate') {
    return 'Standbild: Prototyp vorschlagen (experimentell) oder Tretlager / Sattel / Hoods manuell klicken.'
  }
  if (step === 'body') return 'Person erkannt? Dann Pedalmarker auswählen.'
  if (step === 'measure') return 'Countdown starten, sobald die Bühne live ist. Ton am Anfang und Ende.'
  if (step === 'result') return 'Letzter Frame bleibt stehen — oder gespeicherte Messung ohne Kamera.'
  return 'Seitenansicht des Fahrers.'
}

function CaptureLayout() {
  const flow = useFlow()
  const capture = useCaptureSession()
  const evaluating = Boolean(capture.analysis && capture.phase === 'saved')
  return (
    <AppShell
      mode="flow"
      step="capture"
      journey={flow.journey}
      capturePhase={capture.phase}
      gate="Lokal"
      note={
        evaluating
          ? 'Aufnahme wird ausgewertet. Lokal, ohne Cloud, ohne extra Klick.'
          : 'Einrichten und 40 Sekunden aufnehmen. Auf diesem Gerät, ohne Cloud.'
      }
      chrome={
        <div className="lab-escape">
          <button type="button" onClick={() => flow.goTo('start')}>
            Zur Startseite
          </button>
        </div>
      }
      primary={<CapturePrimaryBar />}
      stage={<Stage emptyHint={emptyHint('capture', false)} />}
      stageOverlay={<CaptureStageOverlay />}
      rail={<CaptureScreen />}
    />
  )
}

export function FlowApp() {
  const flow = useFlow()
  const visualCards =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('cards')
  if (visualCards) {
    return <CardVisualScreen />
  }

  if (flow.mode === 'lab') {
    return <LabView onBack={() => flow.setMode('flow')} />
  }

  if (flow.step === 'start') {
    return (
      <div className="app" data-mode="flow" data-flow-step="start" data-journey={flow.journey}>
        <header className="mast">
          <div className="mast-brand">
            <span className="wordmark">BikeFit Mac</span>
            <span className="gate">Lokal</span>
          </div>
          <p className="mast-note">Chrome. Keine Konten. Kein Upload.</p>
          <HelpPanel />
        </header>
        <StartScreen />
      </div>
    )
  }

  if (flow.step === 'capture') {
    return (
      <CaptureSessionProvider>
        <CaptureLayout />
      </CaptureSessionProvider>
    )
  }

  const meta = FLOW_STEP_META[flow.step]
  return (
    <AppShell
      mode="flow"
      step={flow.step}
      journey={flow.journey}
      measurePhase={flow.measure.phase}
      gate="Lokal"
      note={`${meta.n} · ${meta.title}. Auf diesem Gerät, ohne Cloud.`}
      chrome={
        <Stepper
          current={flow.step}
          locked={flow.measure.phase === 'countdown' || flow.measure.phase === 'recording'}
          onSelect={(id) => {
            if (id === 'start') flow.goTo('start')
            else flow.goTo(id)
          }}
        />
      }
      primary={<FlowPrimary />}
      stage={<Stage emptyHint={emptyHint(flow.step, flow.journey === 'demo')} />}
      stageOverlay={
        flow.step === 'measure' ? (
          <div className="stage-hud">
            <p className="overlay-legend">
              <span className="lg-ist">Ist</span>
              <span className="lg-soll">{SOLL_GHOST_LABEL}</span>
            </p>
            <Countdown phase={flow.measure.phase} count={flow.measure.countdown} />
            {flow.measure.phase !== 'ready' && flow.measure.phase !== 'countdown' && (
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
