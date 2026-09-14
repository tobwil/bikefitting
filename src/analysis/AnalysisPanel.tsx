import type { AnalysisJob } from '../types/analysis.ts'
import { isAnalysisRunning } from '../types/analysis.ts'
import {
  ANALYZED_LABEL,
  ANALYSIS_STAGE_COPY,
  EVALUATING_LABEL,
  MARKERLESS_MEASURED_LABEL,
  MARKERLESS_UNAVAILABLE_LABEL,
  METRICS_PENDING_LABEL,
  NO_PEDALING_LABEL,
  RETRY_ANALYSIS_LABEL,
  framesProgressCopy,
  selectedSpanCopy,
} from './copy.ts'

export function AnalysisProgressBar(props: { job: AnalysisJob }) {
  const pct = Math.round(props.job.progress.ratio * 100)
  return (
    <div
      className="analysis-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-analysis-progress={pct}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function AnalysisPanel(props: {
  job: AnalysisJob
  previewUrl: string | null
  onRetry: () => void
  onNewRecording: () => void
  onDownload?: () => void
}) {
  const { job } = props
  const running = isAnalysisRunning(job.phase)
  const failed = job.phase === 'failed' || job.phase === 'cancelled'
  const done = job.phase === 'done'
  const title = running ? EVALUATING_LABEL : failed ? job.error?.message ?? ANALYSIS_STAGE_COPY.failed : done
    ? job.selected
      ? ANALYZED_LABEL
      : NO_PEDALING_LABEL
    : EVALUATING_LABEL

  return (
    <div
      className="analysis-panel capture-saved"
      data-analysis-phase={job.phase}
      data-analysis-job={job.jobId}
      data-capture-id={job.captureId}
      data-input-hash={job.inputHash}
      data-capture-saved="complete"
    >
      <p className={failed ? 'lost-banner' : 'ok-note'} data-analysis-title role={failed ? 'alert' : 'status'}>
        {title}
      </p>
      {props.previewUrl && (
        <video src={props.previewUrl} controls playsInline muted className="capture-playback" data-analysis-preview />
      )}
      {running && (
        <>
          <AnalysisProgressBar job={job} />
          <p className="muted" data-analysis-frames>
            {framesProgressCopy(job.progress.posedFrames, job.progress.plannedFrames)}
            {job.progress.plannedFrames > 0 ? ` · ${ANALYSIS_STAGE_COPY[job.phase]}` : ''}
          </p>
        </>
      )}
      {done && job.selected && (
        <p className="muted" data-analysis-segment>
          {selectedSpanCopy(job.selected.startMs, job.selected.endMs)}
        </p>
      )}
      {done && job.metrics?.status === 'not_implemented' && (
        <p className="muted" data-metrics-pending>
          {METRICS_PENDING_LABEL}
        </p>
      )}
      {done && job.metrics?.status === 'ok' && (
        <p className="muted" data-metrics-method={job.metrics.observation?.method ?? 'max_extension'}>
          {MARKERLESS_MEASURED_LABEL}
          {job.metrics.usableCycles != null ? ` n=${job.metrics.usableCycles}` : ''}
        </p>
      )}
      {done && job.metrics?.status === 'unavailable' && (
        <p className="muted" data-metrics-unavailable>
          {MARKERLESS_UNAVAILABLE_LABEL}
        </p>
      )}
      {done && !job.selected && (
        <p className="muted">Stillstand, Aufsteigen oder Absteigen wurden getrennt. Es blieb kein nutzbarer Tretabschnitt.</p>
      )}
      <div className="btn-row">
        {failed && (
          <button type="button" className="is-active" data-action="retry-analysis" onClick={props.onRetry}>
            {RETRY_ANALYSIS_LABEL}
          </button>
        )}
        {props.onDownload && (
          <button type="button" data-action="download-clip" onClick={props.onDownload}>
            Clip herunterladen
          </button>
        )}
        <button type="button" data-action="new-recording" onClick={props.onNewRecording}>
          Neue Aufnahme
        </button>
      </div>
    </div>
  )
}

export function AnalysisPrimaryBar(props: { job: AnalysisJob; onRetry: () => void }) {
  const running = isAnalysisRunning(props.job.phase)
  const failed = props.job.phase === 'failed' || props.job.phase === 'cancelled'
  return (
    <div className="flow-primary capture-primary" data-analysis-primary={props.job.phase}>
      <div className="status-banner">
        <div>
          <strong>{running ? EVALUATING_LABEL : failed ? RETRY_ANALYSIS_LABEL : ANALYZED_LABEL}</strong>
          <p>
            {running
              ? framesProgressCopy(props.job.progress.posedFrames, props.job.progress.plannedFrames)
              : failed
                ? props.job.error?.message
                : ANALYSIS_STAGE_COPY.done}
          </p>
        </div>
        <div className="flow-primary-actions">
          {failed && (
            <button type="button" className="is-active" data-action="retry-analysis" onClick={props.onRetry}>
              {RETRY_ANALYSIS_LABEL}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
