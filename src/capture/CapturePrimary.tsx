import { useEffect } from 'react'
import { useCaptureSession } from './CaptureSession.tsx'
import { CaptureHud } from './CaptureHud.tsx'
import {
  RECORD_ANYWAY_LABEL,
  RECORD_PRIMARY_LABEL,
  RECORD_PRIMARY_SUB,
} from './copy.ts'
import { AnalysisPrimaryBar } from '../analysis/AnalysisPanel.tsx'

export function CaptureStageOverlay() {
  const capture = useCaptureSession()
  return (
    <CaptureHud
      connected={capture.connected}
      phase={capture.phase}
      countdownRemainingMs={capture.countdownRemainingMs}
      recordRemainingMs={capture.recordRemainingMs}
      flash={capture.flash}
      hint={capture.hint && capture.phase === 'idle' ? capture.hint.message : null}
    />
  )
}

export function CapturePrimaryBar() {
  const capture = useCaptureSession()
  const blocked = capture.error?.code === 'quota' || capture.error?.code === 'camera_missing'
  const live = capture.phase === 'countdown' || capture.phase === 'recording'

  const abort = capture.abort
  const phase = capture.phase

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (phase !== 'countdown' && phase !== 'recording') return
      event.preventDefault()
      abort()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abort, phase])

  if (capture.phase === 'saved' && capture.analysis) {
    return <AnalysisPrimaryBar job={capture.analysis} onRetry={() => void capture.retryAnalysis()} />
  }
  if (capture.phase === 'saved') return null

  const framingChoice = capture.hint?.primaryKind === 'correct_framing' && capture.phase === 'idle'
  const title = live
    ? capture.phase === 'countdown'
      ? 'Aufnahme startet'
      : 'Aufnahme läuft'
    : framingChoice
      ? capture.hint?.message ?? RECORD_PRIMARY_LABEL
      : RECORD_PRIMARY_LABEL
  const detail = live
    ? 'Nicht auf den Bildschirm schauen. Escape bricht ab.'
    : framingChoice
      ? RECORD_ANYWAY_LABEL
      : RECORD_PRIMARY_SUB

  return (
    <div className="flow-primary capture-primary">
      <div className="status-banner">
        <div>
          <strong>{title}</strong>
          <p>{detail}</p>
        </div>
        <div className="flow-primary-actions">
          {live ? (
            <button type="button" className="is-active" data-action="abort-capture" onClick={capture.abort}>
              Abbrechen
            </button>
          ) : framingChoice ? (
            <button
              type="button"
              className="is-active"
              data-action="record-anyway"
              disabled={!capture.connected || blocked}
              onClick={capture.startRecord}
            >
              {RECORD_ANYWAY_LABEL}
            </button>
          ) : (
            <button
              type="button"
              className="is-active"
              data-action="record-40"
              disabled={!capture.connected || capture.recording || blocked}
              onClick={capture.startRecord}
            >
              {RECORD_PRIMARY_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
