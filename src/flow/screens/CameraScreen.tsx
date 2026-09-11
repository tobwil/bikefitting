import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { CameraPanel } from '../../camera/index.ts'
import { PoseOverlay } from '../../pose/index.ts'
import { FileSourcePanel } from '../../file/index.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function CameraScreen() {
  const fit = useFit()
  const flow = useFlow()
  const demo = flow.journey === 'demo'
  const fromFile = flow.journey === 'file' || fit.camera.status.source === 'file'
  const devices = fit.camera.status.devices
  return (
    <div className="flow-screen" data-screen="camera">
      <section className="module-slot">
        <p className="kicker">02 · Kamera einrichten</p>
        <h2>{demo ? 'Beispielaufnahme' : fromFile ? 'Lokale Datei' : 'Seitenblick, Hoods, Trainer'}</h2>
        <p>
          {demo
            ? 'Das ist eine Beispielaufnahme ohne eigene Kamera. So siehst du die Schritte, bevor du selbst misst.'
            : fromFile
              ? 'Die Datei bleibt auf diesem Gerät. Kein Upload. Video mit der Zeit der Datei; Einzelbild nur als statische Prüfung.'
              : 'Nur nach Klick. Video ohne Mikrofon. Chrome auf dem Mac. iPhone kann als Kamera dienen — das Gerät vor dem Start wählen.'}
        </p>
        {!demo && !fromFile && devices.length > 1 && (
          <label className="field">
            <span>Kamera</span>
            <select
              value={fit.camera.status.deviceId ?? ''}
              onChange={(event) => {
                const id = event.target.value || undefined
                void fit.camera.start(id)
              }}
            >
              <option value="">Standard</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || 'Kamera'}
                </option>
              ))}
            </select>
          </label>
        )}
        {fromFile && (
          <FileSourcePanel
            file={fit.camera.file}
            error={fit.camera.status.source === 'file' ? fit.camera.status.error : null}
            onPick={(file) => void fit.camera.startFile(file)}
          />
        )}
        {flow.cameraReady && !fromFile && (
          <button type="button" onClick={fit.camera.stop}>
            Kamera stoppen
          </button>
        )}
      </section>
      <DiagnosePanel
        extra={
          <>
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
            />
          </>
        }
      />
    </div>
  )
}
