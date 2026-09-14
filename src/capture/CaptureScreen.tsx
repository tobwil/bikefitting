import { useRef } from 'react'
import { CameraZoomControl } from '../camera/CameraZoomControl.tsx'
import { displayCameraDeviceLabel } from '../camera/deviceLabel.ts'
import { DiagnosePanel } from '../flow/components/DiagnosePanel.tsx'
import { useFlow } from '../flow/FlowProvider.tsx'
import { FILE_ACCEPT } from '../file/classify.ts'
import { useFit } from '../shell/FitSession.tsx'
import { ContinuityHelp } from './ContinuityHelp.tsx'
import { useCaptureSession } from './CaptureSession.tsx'
import {
  INCOMPLETE_LABEL,
  SAVED_LABEL,
  START_SECONDARY_FILE,
} from './copy.ts'
import { savedUiLabel } from './copy.ts'
import { downloadCaptureBlob } from './storage.ts'
import { AnalysisPanel } from '../analysis/AnalysisPanel.tsx'
import { CHANGE_COPY } from '../change/copy.ts'

export function CaptureScreen() {
  const fit = useFit()
  const flow = useFlow()
  const capture = useCaptureSession()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const savedLabel = savedUiLabel({
    persisted: Boolean(capture.asset),
    decoded: Boolean(capture.previewUrl && capture.asset),
    completeness: capture.asset?.completeness ?? null,
  })
  const statusError = capture.error?.message ?? capture.cameraError

  return (
    <div className="flow-screen capture-rail" data-screen="capture" data-capture-phase={capture.phase}>
      <section className="module-slot">
        <p className="kicker">Einrichten</p>
        <h2>Seitenblick, dann 40 Sekunden</h2>
        <p>Kamera einrichten und aufnehmen auf demselben Bildschirm. Keine Marker, keine Kalibrierung.</p>
        {flow.pendingChange && (
          <p className="ok-note" data-compare-recapture>
            {CHANGE_COPY.recaptureBanner}
          </p>
        )}
        {capture.devices.length > 0 && (
          <label className="field">
            <span>Kamera</span>
            <select
              value={capture.currentId ?? ''}
              disabled={capture.recording}
              onChange={(event) => capture.requestDevice(event.target.value)}
            >
              <option value="">Kamera wählen</option>
              {capture.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {displayCameraDeviceLabel(device.label, index)}
                </option>
              ))}
            </select>
          </label>
        )}
        {fit.camera.status.permission === 'granted' && (
          <CameraZoomControl
            key={fit.camera.stream?.getVideoTracks()[0]?.id ?? 'no-track'}
            stream={fit.camera.stream}
            onGeometryChange={fit.camera.bumpGeometryRevision}
          />
        )}
        {capture.pendingMac && (
          <div className="capture-confirm" data-confirm-mac role="alertdialog">
            <p>
              Die Live-Kamera würde auf die Mac-Kamera wechseln ({capture.pendingMac.label || 'FaceTime'}).
              Nicht stillschweigend wechseln.
            </p>
            <div className="btn-row">
              <button type="button" className="is-active" onClick={capture.cancelMac}>
                Aktuelle Kamera behalten
              </button>
              <button type="button" onClick={capture.confirmMac}>
                Mac-Kamera verwenden
              </button>
            </div>
          </div>
        )}
        {capture.noIphone && <ContinuityHelp compact />}
        {capture.hint && capture.phase === 'idle' && (
          <div className="help-on-problem" data-framing-code={capture.hint.code}>
            <p>{capture.hint.message}</p>
            {capture.hint.secondaryExplain && <p className="muted">{capture.hint.secondaryExplain}</p>}
          </div>
        )}
        {statusError && (
          <p className="lost-banner" role="alert" data-capture-error={capture.error?.code ?? 'camera'}>
            {statusError}
          </p>
        )}
        {savedLabel === SAVED_LABEL && capture.asset && capture.analysis && (
          <AnalysisPanel
            job={capture.analysis}
            previewUrl={capture.previewUrl}
            onRetry={() => void capture.retryAnalysis()}
            onNewRecording={capture.reset}
            onDownload={
              capture.blob && capture.asset
                ? () => capture.blob && capture.asset && downloadCaptureBlob(capture.asset.filename, capture.blob)
                : undefined
            }
          />
        )}
        {savedLabel === SAVED_LABEL && capture.asset && !capture.analysis && (
          <div className="capture-saved" data-capture-saved="complete">
            <p className="ok-note" data-saved-label>
              {SAVED_LABEL}
            </p>
            <video src={capture.previewUrl ?? undefined} controls playsInline muted className="capture-playback" />
            <div className="btn-row">
              <button
                type="button"
                disabled={!capture.blob}
                onClick={() => capture.blob && capture.asset && downloadCaptureBlob(capture.asset.filename, capture.blob)}
              >
                Clip herunterladen
              </button>
              <button type="button" onClick={capture.reset}>
                Neue Aufnahme
              </button>
            </div>
          </div>
        )}
        {savedLabel === INCOMPLETE_LABEL && capture.asset && (
          <div className="capture-saved" data-capture-saved="incomplete">
            <p className="lost-banner" data-saved-label>
              {INCOMPLETE_LABEL} — nicht als vollständige Aufnahme gekennzeichnet.
            </p>
            <video src={capture.previewUrl ?? undefined} controls playsInline muted className="capture-playback" />
            <div className="btn-row">
              <button type="button" className="is-active" onClick={capture.reset}>
                Erneut aufnehmen
              </button>
            </div>
          </div>
        )}
        {capture.phase !== 'saved' && capture.phase !== 'finalizing' && (
          <div className="capture-actions">
            {(capture.phase === 'countdown' || capture.phase === 'recording') && (
              <p className="muted">Keine Bedienung am Mac nötig. Escape oder Abbrechen stoppt die Aufnahme.</p>
            )}
            <label className="capture-preroll">
              <input
                type="checkbox"
                checked={capture.longPreroll}
                onChange={(event) => capture.setLongPreroll(event.target.checked)}
                disabled={capture.recording}
              />
              20 Sekunden Vorlauf
            </label>
          </div>
        )}
        <button type="button" className="text-link" data-action="open-existing-video" onClick={() => fileRef.current?.click()}>
          {START_SECONDARY_FILE}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const next = event.target.files?.[0]
            event.target.value = ''
            if (next) void capture.importFile(next)
          }}
        />
        <p className="muted">{flow.captures.length} lokale Clips auf diesem Gerät.</p>
        <button type="button" onClick={() => flow.goTo('start')}>
          Zur Startseite
        </button>
      </section>
      <DiagnosePanel />
    </div>
  )
}
