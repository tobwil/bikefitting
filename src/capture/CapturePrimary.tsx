import { useCaptureSession } from './CaptureSession.tsx'
import { CaptureHud } from './CaptureHud.tsx'
import {
  CORRECT_FRAMING_LABEL,
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
  if (capture.phase === 'saved' && capture.analysis) {
    return <AnalysisPrimaryBar job={capture.analysis} onRetry={() => void capture.retryAnalysis()} />
  }
  if (capture.phase === 'saved') return null
  const framingChoice = capture.hint?.primaryKind === 'correct_framing' && capture.phase === 'idle'
  return (
    <div className="flow-primary capture-primary">
      <div className="status-banner">
        <div>
          <strong>{framingChoice ? CORRECT_FRAMING_LABEL : RECORD_PRIMARY_LABEL}</strong>
          <p>{framingChoice ? capture.hint?.message : RECORD_PRIMARY_SUB}</p>
        </div>
        <div className="flow-primary-actions">
          {framingChoice ? (
            <>
              <button type="button" data-action="correct-framing">
                {CORRECT_FRAMING_LABEL}
              </button>
              <button
                type="button"
                className="is-active"
                data-action="record-anyway"
                disabled={!capture.connected || blocked}
                onClick={capture.startRecord}
              >
                {RECORD_ANYWAY_LABEL}
              </button>
            </>
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
          {(capture.phase === 'countdown' || capture.phase === 'recording') && (
            <button type="button" data-action="abort-capture" onClick={capture.abort}>
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
