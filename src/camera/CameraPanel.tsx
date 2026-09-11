import { ALLOW_SYNTHETIC_FIXTURE } from '../config/defaults.ts'
import type { CameraStatus, VideoPlayback } from '../types/camera.ts'
import type { LocalFileMeta } from '../types/file.ts'
import { displayCameraDeviceLabel } from './deviceLabel.ts'
import { useCamera } from './useCamera.ts'
import { FILE_ACCEPT } from '../file/classify.ts'

export type CameraPanelProps = {
  status?: CameraStatus
  start?: (deviceId?: string) => Promise<void>
  stop?: () => void
  restart?: () => Promise<void>
  startSynthetic?: () => void
  startFile?: (file: File) => Promise<void>
  file?: LocalFileMeta | null
  playback?: VideoPlayback
}

const IDLE_PLAYBACK: VideoPlayback = {
  playable: false,
  width: 0,
  height: 0,
  playError: null,
}

export function CameraPanel(props: CameraPanelProps = {}) {
  const local = useCamera()
  const status = props.status ?? local.status
  const start = props.start ?? local.start
  const stop = props.stop ?? local.stop
  const startSynthetic = props.startSynthetic ?? local.startSynthetic
  const startFile = props.startFile ?? local.startFile
  const file = props.file ?? local.file
  const playback = props.playback ?? IDLE_PLAYBACK
  const restart =
    props.restart ??
    (async () => {
      if (status.source === 'file') return
      stop()
      if (status.source === 'synthetic') startSynthetic()
      else await start(status.deviceId ?? undefined)
    })

  const live = status.permission === 'granted'
  const busy = status.permission === 'prompting'

  return (
    <section className="module-slot" data-module="camera">
      <header>
        <p className="kicker">Kamera · Continuity</p>
        <h2>
          {live
            ? status.source === 'synthetic'
              ? 'Synthetic fixture'
              : status.source === 'file'
                ? file?.kind === 'image'
                  ? 'Lokales Bild'
                  : 'Lokales Video'
                : 'Live video'
            : 'Nach Klick starten'}
        </h2>
      </header>
      <ul className="camera-setup">
        <li>
          iPhone neben das Rad als <strong>Continuity Camera</strong> — der Mac steuert nur die App.
          Laptop neben dem Rad verdreht Kopf und Haltung.
        </li>
        <li>Berechtigung erst nach Klick auf Start. Gerät <strong>vor</strong> der Messung wählen.</li>
        <li>Nur Video, kein Mikrofon. Status: {status.permission}{status.usingMicrophone ? ' · MIC ON' : ' · mic aus'}.</li>
      </ul>
      {status.error && <p className="status-idle">{status.error}</p>}
      {playback.playError && (
        <p className="lost-banner" data-play-error>
          play() fehlgeschlagen: {playback.playError}
        </p>
      )}
      {live && (
        <p className={playback.playable ? 'ok-note' : 'status-idle'} data-video-ready={playback.playable}>
          {playback.playable
            ? `Video spielbar · ${playback.width}×${playback.height}`
            : 'Stream da, Video noch nicht spielbar (Größe / play()).'}
        </p>
      )}
      <p className="status-idle">
        Kamera stoppt beim Verlassen auf Start, bei Stop/Restart und wenn die Session endet. Ein
        Remount der Bühne bindet denselben Stream neu, solange er noch läuft.
      </p>
      {status.devices.length > 0 && (
        <label className="field">
          <span>Gerät</span>
          <select
            value={status.deviceId ?? ''}
            onChange={(event) => {
              const id = event.target.value || undefined
              void start(id)
            }}
          >
            <option value="">Standardkamera</option>
            {status.devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {displayCameraDeviceLabel(device.label, index)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="btn-row">
        <button type="button" disabled={busy || live} onClick={() => void start()}>
          Start
        </button>
        <button type="button" disabled={!live && status.permission !== 'prompting'} onClick={stop}>
          Stop
        </button>
        <button
          type="button"
          disabled={status.permission === 'idle'}
          onClick={() => void restart()}
        >
          Restart
        </button>
        {ALLOW_SYNTHETIC_FIXTURE && (
          <button type="button" onClick={startSynthetic}>
            Synthetic
          </button>
        )}
        <label className="file-pick">
          Datei
          <input
            type="file"
            accept={FILE_ACCEPT}
            onChange={(event) => {
              const next = event.target.files?.[0]
              event.target.value = ''
              if (next) void startFile(next)
            }}
          />
        </label>
      </div>
    </section>
  )
}
