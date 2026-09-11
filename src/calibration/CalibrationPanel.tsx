import type { BikeCalibration, BikeMarkId, KneeAngleReading } from '../types/calibration.ts'
import { BikeSketch } from './BikeSketch.tsx'
import { MARK_GUIDE, MARK_ORDER, markTitle } from './marks.ts'
import type { CalibrationAssessment } from './validity.ts'
import './calibration.css'

export type CalibrationPanelProps = {
  data?: BikeCalibration
  activeMark?: BikeMarkId
  setActiveMark?: (id: BikeMarkId) => void
  clearMarks?: () => void
  applyFixtureMarks?: () => void
  save?: () => void
  load?: () => void
  knee?: KneeAngleReading
  allowFixture?: boolean
  frozen?: boolean
  onToggleFreeze?: () => void
  assessment?: CalibrationAssessment | null
}

function placed(data: BikeCalibration | undefined, id: BikeMarkId): boolean {
  return Boolean(data?.marks[id])
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
  allowFixture = false,
  frozen = false,
  onToggleFreeze,
  assessment = null,
}: CalibrationPanelProps) {
  const transform = data?.transform ?? null
  const current = MARK_GUIDE[activeMark]
  const stepIndex = MARK_ORDER.indexOf(activeMark) + 1

  return (
    <section className="module-slot" data-module="calibration">
      <header>
        <p className="kicker">Kalibrierung · B → S → G</p>
        <h2>
          Schritt {stepIndex} von 3: {markTitle(activeMark)}
        </h2>
      </header>
      <ul className="cal-hints">
        <li>Seitenansicht, Trainer, Hoods — Kamera auf der nahen Seite.</li>
        <li>Standbild ohne Fahrer: niemand darf Tretlager, Sattel oder Hoods verdecken.</li>
        <li>Reihenfolge fest: zuerst Tretlager, dann Sattel, dann Griffkontakt.</li>
      </ul>
      <div className="cal-current">
        <p>
          <strong>Jetzt:</strong> {current.click} {current.where}
        </p>
      </div>
      <BikeSketch active={activeMark} />
      <div className="cal-steps">
        {MARK_ORDER.map((id) => {
          const guide = MARK_GUIDE[id]
          const done = placed(data, id)
          return (
            <button
              key={id}
              type="button"
              className={`cal-step${activeMark === id ? ' is-active' : ''}${done ? ' is-done' : ''}`}
              onClick={() => setActiveMark?.(id)}
              aria-current={activeMark === id ? 'step' : undefined}
            >
              <span className="cal-step-letter">{guide.letter}</span>
              <span>
                <strong>
                  {guide.letter} = {guide.name}
                  {done ? ' · gesetzt' : ''}
                </strong>
                <small>{guide.where}</small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="btn-row">
        {onToggleFreeze && (
          <button
            type="button"
            className={frozen ? 'is-active' : undefined}
            data-action="cal-freeze"
            onClick={onToggleFreeze}
          >
            {frozen ? 'Standbild lösen' : 'Standbild halten'}
          </button>
        )}
        <button type="button" onClick={save}>
          Speichern
        </button>
        <button type="button" onClick={load}>
          Laden
        </button>
        <button type="button" onClick={clearMarks}>
          Löschen
        </button>
        {allowFixture && (
          <button type="button" data-action="cal-fixture" onClick={applyFixtureMarks}>
            Fixture B/S/G
          </button>
        )}
      </div>
      {assessment && !assessment.ok && (
        <p className="status-idle" data-cal-invalid>
          {assessment.message}
        </p>
      )}
      {assessment?.ok && (
        <p className="ok-note" data-cal-valid>
          B/S/G gültig für diese Kamera.
        </p>
      )}
      <dl className="readout compact">
        <div>
          <dt>Kniebeugung</dt>
          <dd>
            {knee?.visible && knee.degrees !== null ? `${knee.degrees.toFixed(1)}°` : '—'}
          </dd>
        </div>
        <div>
          <dt>Transform</dt>
          <dd>{transform ? 'B gesetzt, Achsen ok' : 'noch Tretlager + Richtung'}</dd>
        </div>
        <div>
          <dt>Setup</dt>
          <dd>{data?.binding?.setupId ?? '—'}</dd>
        </div>
        <div>
          <dt>Standbild</dt>
          <dd>{frozen ? 'gehalten' : 'live'}</dd>
        </div>
      </dl>
    </section>
  )
}
