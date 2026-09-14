import type { CapturePhase } from '../types/capture.ts'
import { CONNECTED_LABEL, CONNECTING_LABEL, RECORD_RUNNING_LABEL } from './copy.ts'

export function CaptureHud(props: {
  connected: boolean
  phase: CapturePhase
  countdownRemainingMs: number
  recordRemainingMs: number
  flash: 'start' | 'end' | null
  hint: string | null
}) {
  const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000))
  const recordingColor = props.phase === 'recording'
  return (
    <div
      className="capture-hud"
      data-capture-hud
      data-capture-phase={props.phase}
      data-flash={props.flash ?? ''}
      data-record-color={recordingColor ? 'on' : 'off'}
    >
      <p className={props.connected ? 'capture-link is-live' : 'capture-link'} data-connected={props.connected ? 'true' : 'false'}>
        {props.connected ? CONNECTED_LABEL : CONNECTING_LABEL}
      </p>
      {props.phase === 'countdown' && (
        <div className="capture-count" data-countdown-live role="status">
          <p className="kicker">Startet in</p>
          <strong>{seconds(props.countdownRemainingMs)}</strong>
          <p>Nicht auf den Bildschirm schauen. Ton am Anfang und Ende.</p>
        </div>
      )}
      {props.phase === 'recording' && (
        <div className="capture-running is-recording" data-recording-live role="status">
          <p className="kicker">{RECORD_RUNNING_LABEL}</p>
          <strong>{seconds(props.recordRemainingMs)}</strong>
          <p>Weiter treten. Die Aufnahme endet automatisch.</p>
        </div>
      )}
      {props.phase === 'finalizing' && (
        <div className="capture-running" role="status">
          <p className="kicker">Speichern</p>
          <strong>Clip wird geprüft…</strong>
        </div>
      )}
      {props.hint && props.phase !== 'countdown' && props.phase !== 'recording' && (
        <p className="capture-hint-overlay">{props.hint}</p>
      )}
    </div>
  )
}
