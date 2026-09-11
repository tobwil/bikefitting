import { ALLOW_SYNTHETIC_FIXTURE } from '../config/defaults.ts'
import type { CameraStatus } from '../types/camera.ts'
import { useCamera } from './useCamera.ts'

export type CameraPanelProps = {
  status?: CameraStatus
  start?: (deviceId?: string) => Promise<void>
  stop?: () => void
  restart?: () => Promise<void>
  startSynthetic?: () => void
}

export function CameraPanel(props: CameraPanelProps = {}) {
  const local = useCamera()
  const status = props.status ?? local.status
  const start = props.start ?? local.start
  const stop = props.stop ?? local.stop
  const startSynthetic = props.startSynthetic ?? local.startSynthetic
  const restart =
    props.restart ??
    (async () => {
      stop()
      if (status.source === 'synthetic') startSynthetic()
      else await start(status.deviceId ?? undefined)
    })

  const live = status.permission === 'granted'
  const busy = status.permission === 'prompting'

  return (
    <section className="module-slot" data-module="camera">
      <header>
        <p className="kicker">Camera · AC-01 / AC-02 / AC-19</p>
        <h2>{live ? (status.source === 'synthetic' ? 'Synthetic fixture' : 'Live video') : 'Click to start'}</h2>
      </header>
      <p>
        Permission stays idle until an explicit Start click. Video only — microphone
        stays off. Status: <code>{status.permission}</code>
        {status.usingMicrophone ? ' · MIC ON' : ' · mic off'}
      </p>
      {status.error && <p className="status-idle">{status.error}</p>}
      {status.devices.length > 1 && (
        <label className="field">
          <span>Device</span>
          <select
            value={status.deviceId ?? ''}
            onChange={(event) => {
              const id = event.target.value || undefined
              void start(id)
            }}
          >
            <option value="">Default</option>
            {status.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
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
      </div>
    </section>
  )
}
