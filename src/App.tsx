import { CameraPanel } from './camera/index.ts'
import { PoseOverlay } from './pose/index.ts'
import { CalibrationPanel } from './calibration/index.ts'
import { PedalPanel } from './pedal/index.ts'
import { SessionsPanel, averageVisibility } from './sessions/index.ts'
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

function App() {
  return (
    <FitProvider>
      <WiredApp />
    </FitProvider>
  )
}

export default App
