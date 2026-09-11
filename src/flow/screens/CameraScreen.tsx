import { CameraPanel } from '../../camera/index.ts'
import { PoseOverlay } from '../../pose/index.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function CameraScreen() {
  const fit = useFit()
  const flow = useFlow()
  return (
    <div className="flow-screen" data-screen="camera">
      <section className="module-slot">
        <p className="kicker">02 · Kamera einrichten</p>
        <h2>iPhone am Rad, Mac nur App</h2>
        <p>
          Continuity Camera: iPhone seitlich an den Trainer, Hoods im Bild. Gerät in der Liste
          wählen, bevor die Messung läuft. Chrome auf dem Mac. Auf der VM: <strong>Synthetic</strong>.
        </p>
      </section>
      <CameraPanel
        status={fit.camera.status}
        start={fit.camera.start}
        stop={fit.camera.stop}
        restart={fit.camera.restart}
        startSynthetic={fit.camera.startSynthetic}
        playback={fit.camera.playback}
      />
      <PoseOverlay
        workerStatus={fit.pose.workerStatus}
        workerError={fit.pose.workerError}
        inferenceMs={fit.pose.inferenceMs}
        nearSide={fit.pose.nearSide}
        frameSync={fit.pose.frameSync}
        engine={fit.pose.frame?.engine ?? '—'}
        freshness={fit.pose.freshness}
        onRetry={() => void fit.pose.retry()}
        onSimulateLoss={fit.camera.allowSynthetic ? fit.pose.simulateLoss : undefined}
      />
      <div className="flow-actions">
        <button type="button" onClick={flow.back}>
          Zurück
        </button>
        <button type="button" className="is-active" disabled={!flow.cameraReady} onClick={flow.next}>
          Weiter zur Kalibrierung
        </button>
      </div>
    </div>
  )
}
