import type { PoseFreshness } from './freshness.ts'

export type PoseOverlayProps = {
  workerStatus?: 'idle' | 'loading' | 'WORKER_READY' | 'error'
  workerError?: string | null
  inferenceMs?: number | null
  nearSide?: string
  frameSync?: 'rvfc' | 'raf' | 'idle'
  engine?: string
  model?: string
  freshness?: PoseFreshness
  onRetry?: () => void
  onSimulateLoss?: () => void
  overlayFilter?: {
    enabled: boolean
    setEnabled: (enabled: boolean) => void
    needsNewTake: boolean
    occludedNearSide: boolean
    lockedSide: string | null
    compare: {
      rawDeg: number | null
      filteredDeg: number | null
      deltaDeg: number | null
    }
  }
}

function freshnessLabel(freshness?: PoseFreshness): string {
  if (!freshness) return '—'
  if (freshness.status === 'live') return 'live'
  if (freshness.status === 'stale') return `veraltet ${Math.round(freshness.ageMs)} ms`
  if (freshness.status === 'lost') return `verloren ${Math.round(freshness.ageMs)} ms`
  return 'idle'
}

export function PoseOverlay({
  workerStatus = 'idle',
  workerError = null,
  inferenceMs = null,
  nearSide = '—',
  frameSync = 'idle',
  engine = '—',
  model = 'lite',
  freshness,
  onRetry,
  onSimulateLoss,
  overlayFilter,
}: PoseOverlayProps) {
  const lost = freshness?.status === 'lost'
  const stale = freshness?.status === 'stale'
  const failed = workerStatus === 'error'
  return (
    <section className="module-slot" data-module="pose">
      <header>
        <p className="kicker">Ist skeleton · worker</p>
        <h2 className={failed || lost ? 'lost' : undefined}>
          {failed ? 'WORKER_ERROR' : workerStatus === 'WORKER_READY' ? 'WORKER_READY' : 'Waiting on worker'}
        </h2>
      </header>
      <p>
        MediaPipe Pose Landmarker runs in a Web Worker (VIDEO mode). Overlay shares
        the video frame clock — no invented Soll fill. Alte Antworten nach Kameratausch
        werden verworfen.
      </p>
      <dl className="readout compact">
        <div>
          <dt>Worker</dt>
          <dd className={workerStatus === 'WORKER_READY' ? 'ok' : failed ? 'lost' : undefined}>
            {workerStatus}
          </dd>
        </div>
        <div>
          <dt>Pose</dt>
          <dd className={lost ? 'lost' : stale ? 'quality-unavailable' : undefined}>
            {freshnessLabel(freshness)}
          </dd>
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
          <dt>Model</dt>
          <dd>{model}</dd>
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
      {workerStatus === 'WORKER_READY' && !failed && freshness?.status === 'idle' && (
        <p className="status-idle" data-pose-miss>
          Keine Person erkannt
        </p>
      )}
      {lost && (
        <p className="lost-banner" data-pose-loss>
          Pose verloren — Fahrer wieder ins Bild oder Retry.
        </p>
      )}
      {stale && !lost && (
        <p className="status-idle" data-pose-stale>
          Pose veraltet. Körpercheck gilt nur für frische Frames.
        </p>
      )}
      {workerError && (
        <p className="status-idle" data-pose-error>
          {workerError}
        </p>
      )}
      <div className="btn-row">
        {onRetry && (
          <button type="button" onClick={onRetry} data-action="pose-retry">
            Worker erneut starten
          </button>
        )}
        {onSimulateLoss && (
          <button type="button" onClick={onSimulateLoss} data-action="simulate-pose-loss">
            Pose-Verlust prüfen
          </button>
        )}
      </div>
      {overlayFilter && (
        <div className="overlay-filter-lab" data-overlay-filter>
          <label>
            <input
              type="checkbox"
              checked={overlayFilter.enabled}
              onChange={(event) => overlayFilter.setEnabled(event.target.checked)}
            />
            1€-Overlay vergleichen
          </label>
          <p>
            Labor. Nur die Bühne. Metriken bleiben ungefiltert. Keine Ampel, kein Default.
          </p>
          {overlayFilter.enabled && (
            <dl className="readout compact">
              <div>
                <dt>Lock-Seite</dt>
                <dd>{overlayFilter.lockedSide ?? '—'}</dd>
              </div>
              <div>
                <dt>Knie roh / 1€</dt>
                <dd>
                  {overlayFilter.compare.rawDeg !== null
                    ? `${overlayFilter.compare.rawDeg.toFixed(1)}°`
                    : '—'}
                  {' / '}
                  {overlayFilter.compare.filteredDeg !== null
                    ? `${overlayFilter.compare.filteredDeg.toFixed(1)}°`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Δ Winkel</dt>
                <dd>
                  {overlayFilter.compare.deltaDeg !== null
                    ? `${overlayFilter.compare.deltaDeg.toFixed(2)}°`
                    : '—'}
                </dd>
              </div>
            </dl>
          )}
          {overlayFilter.needsNewTake && (
            <p className="lost-banner" data-overlay-side-change>
              Kameraseite verdeckt oder gewechselt — nicht messbar. Neue Aufnahme, keine L/R-Mischung.
            </p>
          )}
          {overlayFilter.occludedNearSide && !overlayFilter.needsNewTake && (
            <p className="status-idle">Nahe Seite verdeckt — Kette unvollständig, nichts erfunden.</p>
          )}
        </div>
      )}
    </section>
  )
}
