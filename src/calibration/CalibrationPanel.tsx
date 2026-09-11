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
        <p className="kicker">Calibration · B / S / G</p>
        <h2>{transform ? `Facing ${facing}` : 'Mark B, S, G'}</h2>
      </header>
      <p>
        Click the stage to place the active mark. Origin is B, x forward, y up.
        Knee flexion is numeric only — no traffic-light scoring.
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
          Save
        </button>
        <button type="button" onClick={load}>
          Load
        </button>
        <button type="button" onClick={clearMarks}>
          Clear
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
          <dt>Knee flexion</dt>
          <dd>
            {knee?.visible && knee.degrees !== null ? `${knee.degrees.toFixed(1)}°` : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
