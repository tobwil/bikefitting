import type { PixelPoint } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PedalHarnessResult } from './harness.ts'

export type PedalPanelProps = {
  sample?: PedalSample
  harness?: PedalHarnessResult | null
  runHarness?: () => void
  reset?: () => void
  selecting?: boolean
  setSelecting?: (on: boolean) => void
  seedPoint?: PixelPoint | null
  onReselect?: () => void
}

export function PedalPanel({
  sample,
  harness = null,
  runHarness,
  reset,
  selecting = false,
  setSelecting,
  seedPoint = null,
  onReselect,
}: PedalPanelProps) {
  const status = sample?.status ?? 'idle'
  const lost = status === 'lost'
  const seedLabel = seedPoint
    ? `${seedPoint.x.toFixed(0)}, ${seedPoint.y.toFixed(0)}`
    : '—'

  return (
    <section className="module-slot" data-module="pedal">
      <header>
        <p className="kicker">Pedal marker</p>
        <h2 className={lost ? 'lost' : undefined}>{lost ? 'LOST' : status}</h2>
      </header>
      <p>
        Modus <strong>Pedalmarker auswählen</strong>: in die Bühne klicken, um einen Marker zu
        setzen — nicht nur Magenta. Getrennt von B/S/G. Nach Verlust sichtbar neu wählen.
      </p>
      {selecting && (
        <p className="cal-current" data-pedal-selecting>
          Klick in die Bühne setzt den Seed. Aktuelle Auswahl: <code>{seedLabel}</code>
        </p>
      )}
      {lost && (
        <p className="lost-banner">
          LOST — Marker verloren. Erneut in die Bühne klicken oder „Erneut wählen“.
        </p>
      )}
      <dl className="readout compact">
        <div>
          <dt>Status</dt>
          <dd className={lost ? 'lost' : undefined}>{status}</dd>
        </div>
        <div>
          <dt>Auswahl</dt>
          <dd>{seedLabel}</dd>
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
        {setSelecting && (
          <button
            type="button"
            className={selecting ? 'is-active' : undefined}
            data-action="pedal-select"
            onClick={() => setSelecting(!selecting)}
          >
            Pedalmarker auswählen
          </button>
        )}
        {onReselect && (
          <button type="button" data-action="pedal-reselect" onClick={onReselect}>
            Erneut wählen
          </button>
        )}
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
