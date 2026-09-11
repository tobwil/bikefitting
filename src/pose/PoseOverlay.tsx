export type PoseOverlayProps = {
  workerStatus?: 'idle' | 'loading' | 'WORKER_READY' | 'error'
  workerError?: string | null
  inferenceMs?: number | null
  nearSide?: string
  frameSync?: 'rvfc' | 'raf' | 'idle'
  engine?: string
}

export function PoseOverlay({
  workerStatus = 'idle',
  workerError = null,
  inferenceMs = null,
  nearSide = '—',
  frameSync = 'idle',
  engine = '—',
}: PoseOverlayProps) {
  return (
    <section className="module-slot" data-module="pose">
      <header>
        <p className="kicker">Ist skeleton · worker</p>
        <h2>{workerStatus === 'WORKER_READY' ? 'WORKER_READY' : 'Waiting on worker'}</h2>
      </header>
      <p>
        MediaPipe Pose Landmarker runs in a Web Worker (VIDEO mode). Overlay shares
        the video frame clock — no invented Soll fill.
      </p>
      <dl className="readout compact">
        <div>
          <dt>Worker</dt>
          <dd className={workerStatus === 'WORKER_READY' ? 'ok' : undefined}>{workerStatus}</dd>
        </div>
        <div>
          <dt>Frame sync</dt>
          <dd>{frameSync}</dd>
        </div>
        <div>
          <dt>Engine</dt>
          <dd>{engine}</dd>
        </div>
        <div>
          <dt>Near side</dt>
          <dd>{nearSide}</dd>
        </div>
        <div>
          <dt>Inference</dt>
          <dd>{inferenceMs !== null ? `${inferenceMs.toFixed(1)} ms` : '—'}</dd>
        </div>
      </dl>
      {workerError && <p className="status-idle">{workerError}</p>}
    </section>
  )
}
