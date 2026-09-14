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
  /** Harness / reset stay in Gate-A lab only. */
  lab?: boolean
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
  lab = false,
}: PedalPanelProps) {
  const status = sample?.status ?? 'idle'
  const lost = status === 'lost'
  const seedLabel = seedPoint
    ? `${seedPoint.x.toFixed(0)}, ${seedPoint.y.toFixed(0)}`
    : '—'

  return (
    <section className="module-slot" data-module="pedal" data-pedal-main="true" data-pedal-lab={lab ? 'true' : 'false'}>
      <header>
        <p className="kicker">Pedalbezug</p>
        <h2 className={lost ? 'lost' : undefined}>{lost ? 'Marker verloren' : 'Pedalmarker setzen'}</h2>
      </header>
      <p>
        Ein Klick in die Bühne auf den hellen Punkt am Pedal reicht. Keine Diagnose nötig. Nach Verlust
        denselben Punkt erneut wählen.
      </p>
      <div className="pedal-example" data-pedal-example>
        <span className="pedal-example-dot" aria-hidden="true" />
        <p>So groß und hell sollte der Punkt in der Seitenansicht sein.</p>
      </div>
      {selecting && (
        <p className="cal-current" data-pedal-selecting>
          Klick in die Bühne setzt den Seed. Aktuelle Auswahl: <code>{seedLabel}</code>
        </p>
      )}
      {lost && (
        <p className="lost-banner">
          Marker verloren. Pedalmarker neu wählen — nicht die Kamera neu starten.
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
          <dt>Umdrehungen</dt>
          <dd>{sample?.revolutions ?? 0}</dd>
        </div>
        <div>
          <dt>Winkel</dt>
          <dd>
            {sample?.crankAngleDeg !== null && sample?.crankAngleDeg !== undefined
              ? `${sample.crankAngleDeg.toFixed(1)}°`
              : '—'}
          </dd>
        </div>
      </dl>
      <div className="btn-row">
        {setSelecting && (
          <button
            type="button"
            className="is-active pedal-select-main"
            data-action="pedal-select"
            onClick={() => setSelecting(!selecting)}
          >
            Pedalmarker auswählen
          </button>
        )}
        {onReselect && (
          <button type="button" data-action="pedal-reselect" onClick={onReselect}>
            Pedalmarker neu wählen
          </button>
        )}
        {lab && (
          <>
            <button type="button" data-action="pedal-harness" onClick={runHarness}>
              ≥10 rev harness
            </button>
            <button type="button" data-action="pedal-reset" onClick={reset}>
              Reset track
            </button>
          </>
        )}
      </div>
      {lab && harness && (
        <p className={harness.passed ? 'ok-note' : 'status-idle'}>
          {harness.message}
        </p>
      )}
    </section>
  )
}
