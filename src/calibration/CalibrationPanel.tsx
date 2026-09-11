import type { BikeCalibration, BikeMarkId, KneeAngleReading } from '../types/calibration.ts'
import { BikeSketch } from './BikeSketch.tsx'
import { MARK_GUIDE, MARK_ORDER, markTitle } from './marks.ts'
import type { PixelImage } from './pixels.ts'
import { selectedPoints, type DetectSession } from './propose.ts'
import { StillReview } from './StillReview.tsx'
import { pointStatusLabel, viewQualityLabel } from './statusCopy.ts'
import type { CalibrationAssessment } from './validity.ts'
import './calibration.css'

export type CalibrationDetectApi = {
  session: DetectSession
  stillImage: PixelImage | null
  recognize: () => void
  confirmPoints: () => void
  selectCandidate: (id: string) => void
  fallbackManual: () => void
  correctPoint: (id: BikeMarkId, x: number, y: number) => void
}

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
  detect?: CalibrationDetectApi
}

function placed(data: BikeCalibration | undefined, id: BikeMarkId): boolean {
  return Boolean(data?.marks[id])
}

function stepStatus(data: BikeCalibration | undefined, detect: DetectSession | undefined, id: BikeMarkId): string {
  const fromDetect = detect ? selectedPoints(detect)?.[id]?.status : undefined
  const stored = data?.provenance?.[id]?.status
  const status = stored ?? fromDetect
  if (!status) return placed(data, id) ? 'bestätigt' : ''
  return pointStatusLabel(status)
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
  detect,
}: CalibrationPanelProps) {
  const transform = data?.transform ?? null
  const current = MARK_GUIDE[activeMark]
  const stepIndex = MARK_ORDER.indexOf(activeMark) + 1
  const session = detect?.session
  const reviewing = session?.phase === 'review' || session?.phase === 'applied'
  const needPick = Boolean(session && session.candidates.length > 1 && !session.selectedId)
  const canConfirm = Boolean(
    session &&
    session.phase === 'review' &&
    !needPick &&
    session.perspectiveOk,
  )

  return (
    <section className="module-slot" data-module="calibration" data-cal-detect-phase={session?.phase ?? 'idle'}>
      <header>
        <p className="kicker">Kalibrierung · erkennen oder B → S → G</p>
        <h2>
          {reviewing
            ? 'Vorschläge prüfen'
            : session?.phase === 'manual' || session?.phase === 'failed'
              ? `Schritt ${stepIndex} von 3: ${markTitle(activeMark)}`
              : 'Fahrrad erkennen'}
        </h2>
      </header>
      <ul className="cal-hints">
        <li>Seitenansicht, Trainer, Hoods — Kamera auf der nahen Seite.</li>
        <li>Erst das Rad vorschlagen lassen, dann bestätigen. Drei Klicks bleiben der Fallback.</li>
        <li>Sattel = Oberseite der Auflage, nicht die Nase. G zuerst am Rad, Griffkontakt später.</li>
      </ul>

      {detect && (
        <div className="cal-detect">
          <div className="btn-row">
            <button type="button" className="is-active" data-action="cal-recognize" onClick={detect.recognize}>
              Fahrrad erkennen
            </button>
            <button type="button" data-action="cal-confirm-points" disabled={!canConfirm} onClick={detect.confirmPoints}>
              Punkte passen
            </button>
            <button type="button" data-action="cal-manual-fallback" onClick={detect.fallbackManual}>
              Manuell setzen
            </button>
          </div>
          {session?.message && (
            <p className={session.phase === 'failed' ? 'status-idle' : 'cal-detect-msg'} data-cal-detect-msg>
              {session.message}
            </p>
          )}
          {needPick && session && (
            <div className="btn-row" data-cal-pick-bike>
              {session.candidates.map((c, i) => (
                <button key={c.id} type="button" onClick={() => detect.selectCandidate(c.id)}>
                  Fahrrad {i + 1}
                  {c.region.facing === -1 ? ' · ←' : ' · →'}
                </button>
              ))}
            </div>
          )}
          {reviewing && session && (
            <p className="muted" data-cal-view-quality>
              {viewQualityLabel(session.candidates.find((c) => c.id === session.selectedId)?.viewQuality ?? 'none')}
              {session.version.detector ? ` · ${session.version.detector}` : ''}
              {session.version.model ? ` · ${session.version.model}` : ' · ohne Cloud-Modell'}
            </p>
          )}
          {detect.stillImage && (
            <StillReview
              image={detect.stillImage}
              session={session ?? detect.session}
              activeMark={activeMark}
              onCorrect={(id, x, y) => detect.correctPoint(id, x, y)}
              onSelectMark={(id) => setActiveMark?.(id)}
            />
          )}
        </div>
      )}

      <div className="cal-current">
        <p>
          <strong>Jetzt:</strong>{' '}
          {reviewing
            ? 'Punkte passen — oder ziehen. Unsichere Punkte nicht stillschweigend übernehmen.'
            : `${current.click} ${current.where}`}
        </p>
      </div>
      <BikeSketch active={activeMark} />
      <div className="cal-steps">
        {MARK_ORDER.map((id) => {
          const guide = MARK_GUIDE[id]
          const done = placed(data, id)
          const status = stepStatus(data, session, id)
          return (
            <button
              key={id}
              type="button"
              className={`cal-step${activeMark === id ? ' is-active' : ''}${done ? ' is-done' : ''}`}
              onClick={() => setActiveMark?.(id)}
              aria-current={activeMark === id ? 'step' : undefined}
              data-cal-point-status={status || undefined}
            >
              <span className="cal-step-letter">{guide.letter}</span>
              <span>
                <strong>
                  {guide.letter} = {guide.name}
                  {status ? ` · ${status}` : done ? ' · gesetzt' : ''}
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
        <div>
          <dt>Erkennung</dt>
          <dd>{session?.phase === 'applied' ? 'bestätigt' : session?.phase === 'review' ? 'vorgeschlagen' : session?.phase ?? '—'}</dd>
        </div>
        <div>
          <dt>Ursprung</dt>
          <dd>{data?.provenance?.B?.origin ?? data?.detect?.version.detector ?? 'manuell'}</dd>
        </div>
      </dl>
    </section>
  )
}
