import { CameraPanel } from './camera/index.ts'
import { PoseOverlay } from './pose/index.ts'
import { CalibrationPanel } from './calibration/index.ts'
import { PedalPanel } from './pedal/index.ts'
import { MetricsPanel } from './metrics/index.ts'
import { SollPanel } from './soll/index.ts'
import { AppShell } from './shell/AppShell.tsx'
import { FitProvider, useFit } from './shell/FitSession.tsx'
import { Stage } from './shell/Stage.tsx'

function WiredApp() {
  const fit = useFit()
  return (
    <AppShell
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
    />
  )
}

function App() {
  return (
    <FitProvider>
      <WiredApp />
    </FitProvider>
  )
}

export default App
