import type { BikeCalibration, BikeMarkId, KneeAngleReading } from '../types/calibration.ts'

export type CalibrationPanelProps = {
  data?: BikeCalibration
  activeMark?: BikeMarkId
  setActiveMark?: (id: BikeMarkId) => void
  clearMarks?: () => void
  applyFixtureMarks?: () => void
  save?: () => void
  load?: () => void
  knee?: KneeAngleReading
}

function markLabel(id: BikeMarkId, data?: BikeCalibration): string {
  const p = data?.marks[id]
  return p ? `${id} ${p.x.toFixed(0)},${p.y.toFixed(0)}` : `${id} —`
}

export function CalibrationPanel({
  data,
  activeMark = 'B',
  setActiveMark,
  clearMarks,
  applyFixtureMarks,
  save,
  load,
  knee,
}: CalibrationPanelProps) {
  const transform = data?.transform ?? null
  const facing = transform ? (transform.facing > 0 ? '+X' : '−X') : '—'

  return (
    <section className="module-slot" data-module="calibration">
      <header>
        <p className="kicker">Kalibrierung · B / S / G</p>
        <h2>{transform ? `Blick ${facing}` : 'B, S und G setzen'}</h2>
      </header>
      <p>
        Aktive Marke wählen, dann in die Bühne klicken. Ursprung B, x vorwärts, y oben.
        Kniebeugung bleibt eine Zahl — keine farbige Bewertung.
      </p>
      <div className="btn-row">
        {(['B', 'S', 'G'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={activeMark === id ? 'is-active' : undefined}
            onClick={() => setActiveMark?.(id)}
          >
            {markLabel(id, data)}
          </button>
        ))}
      </div>
      <div className="btn-row">
        <button type="button" onClick={save}>
          Speichern
        </button>
        <button type="button" onClick={load}>
          Laden
        </button>
        <button type="button" onClick={clearMarks}>
          Löschen
        </button>
        <button type="button" onClick={applyFixtureMarks}>
          Fixture B/S/G
        </button>
      </div>
      <dl className="readout compact">
        <div>
          <dt>Transform</dt>
          <dd>
            {transform
              ? `B ${transform.originPx.x.toFixed(0)},${transform.originPx.y.toFixed(0)} · ${facing}`
              : 'need B + facing'}
          </dd>
        </div>
        <div>
          <dt>Kniebeugung</dt>
          <dd>
            {knee?.visible && knee.degrees !== null ? `${knee.degrees.toFixed(1)}°` : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
