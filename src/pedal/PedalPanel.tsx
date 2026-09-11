import type { PedalSample } from '../types/pedal.ts'
import type { PedalHarnessResult } from './harness.ts'

export type PedalPanelProps = {
  sample?: PedalSample
  harness?: PedalHarnessResult | null
  runHarness?: () => void
  reset?: () => void
}

export function PedalPanel({
  sample,
  harness = null,
  runHarness,
  reset,
}: PedalPanelProps) {
  const status = sample?.status ?? 'idle'
  const lost = status === 'lost'

  return (
    <section className="module-slot" data-module="pedal">
      <header>
        <p className="kicker">Pedal marker</p>
        <h2 className={lost ? 'lost' : undefined}>{lost ? 'LOST' : status}</h2>
      </header>
      <p>
        Track a high-contrast marker across ≥10 crank revolutions. Surface phase
        or angle. Fail visibly if the lock is lost.
      </p>
      {lost && <p className="lost-banner">LOST — marker lock failed. Restart or re-seed.</p>}
      <dl className="readout compact">
        <div>
          <dt>Status</dt>
          <dd className={lost ? 'lost' : undefined}>{status}</dd>
        </div>
        <div>
          <dt>Revolutions</dt>
          <dd>{sample?.revolutions ?? 0}</dd>
        </div>
        <div>
          <dt>Angle</dt>
          <dd>
            {sample?.crankAngleDeg !== null && sample?.crankAngleDeg !== undefined
              ? `${sample.crankAngleDeg.toFixed(1)}°`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>
            {sample?.phase01 !== null && sample?.phase01 !== undefined
              ? sample.phase01.toFixed(3)
              : '—'}
          </dd>
        </div>
      </dl>
      <div className="btn-row">
        <button type="button" onClick={runHarness}>
          ≥10 rev harness
        </button>
        <button type="button" onClick={reset}>
          Reset track
        </button>
      </div>
      {harness && (
        <p className={harness.passed ? 'ok-note' : 'status-idle'}>
          {harness.message}
        </p>
      )}
    </section>
  )
}
