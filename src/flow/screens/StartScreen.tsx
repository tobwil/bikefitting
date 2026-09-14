import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { AmpelNotice } from '../components/AmpelNotice.tsx'
import { DemoPill, StorageErrorNotice } from '../components/DemoBanner.tsx'
import { FILE_ACCEPT } from '../../file/classify.ts'
import { useRef, useState } from 'react'
import {
  START_DEMO_LABEL,
  START_EXPERT_LABEL,
  START_PRIMARY_LABEL,
  START_PRIMARY_SUB,
  START_SECONDARY_CAPTURES,
  START_SECONDARY_FILE,
} from '../../capture/copy.ts'

export function StartScreen() {
  const flow = useFlow()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [showCaptures, setShowCaptures] = useState(false)
  return (
    <div className="flow-home" data-screen="start">
      <div className="flow-home-copy">
        <p className="kicker">Lokale Aufnahme</p>
        <h1>Einrichten, 40 Sekunden, gespeichert.</h1>
        <p className="lede">
          iPhone als Continuity-Kamera am Mac. Ein Bildschirm für Setup und Aufnahme. Keine Marker, kein
          Mikrofon, kein Upload.
        </p>
        <ol className="flow-explain">
          <li>iPhone quer, hintere Kamera zum Fahrer, nah am Mac.</li>
          <li>Ganze Beinlinie im Bild — dann 40 Sekunden treten.</li>
          <li>Die Aufnahme endet von allein. Gespeichert gilt erst nach geprüftem Clip.</li>
        </ol>
        <AmpelNotice profile={flow.profile} />
        <StorageErrorNotice message={flow.storageError} />
        <p className="help-home-hint">
          Live: „{START_PRIMARY_LABEL}“. Gespeichert: „{START_SECONDARY_CAPTURES}“. Kamera- und
          Startprobleme unter <strong>Hilfe</strong> — dort steht auch die getestete Version.
        </p>
      </div>

      <div className="flow-home-actions">
        <button type="button" className="flow-hero-card is-primary-start" onClick={flow.startBeginner} data-action="start-bikefit">
          <span className="kicker">Einsteigermodus</span>
          <strong>{START_PRIMARY_LABEL}</strong>
          <span>{START_PRIMARY_SUB}</span>
        </button>
        <div className="flow-home-secondary">
          <button type="button" className="text-link" data-action="open-existing-video" onClick={() => fileRef.current?.click()}>
            {START_SECONDARY_FILE}
          </button>
          <button
            type="button"
            className="text-link"
            data-action="open-captures"
            onClick={() => setShowCaptures((open) => !open)}
          >
            {START_SECONDARY_CAPTURES}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={FILE_ACCEPT}
          hidden
          onChange={(event) => {
            const next = event.target.files?.[0]
            event.target.value = ''
            if (next) void flow.importBeginnerVideo(next)
          }}
        />
        {showCaptures && (
          <div className="flow-hero-card is-list" data-capture-history>
            <span className="kicker">Clips auf diesem Gerät</span>
            <strong>{START_SECONDARY_CAPTURES}</strong>
            {flow.captures.length === 0 ? (
              <p className="muted">Noch keine Aufnahme gespeichert.</p>
            ) : (
              <ul className="capture-list">
                {flow.captures.map((row) => (
                  <li key={row.captureId}>
                    <button type="button" onClick={() => void flow.openCapture(row.captureId)}>
                      <span>
                        {row.filename} · {row.completeness === 'complete' ? 'vollständig' : 'unvollständig'}
                      </span>
                      <small>{new Date(row.createdAt).toLocaleString('de-DE')}</small>
                    </button>
                    <button type="button" className="ghost" onClick={() => void flow.removeCapture(row.captureId)} aria-label="Löschen">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flow-home-expert">
          <button type="button" data-action="new-measure" onClick={flow.startExpert}>
            {START_EXPERT_LABEL} — B/S/G und Pedalmarker
          </button>
          {ALLOW_SYNTHETIC_FIXTURE && (
            <button type="button" data-action="try-demo" onClick={flow.startDemo}>
              {START_DEMO_LABEL} ausprobieren
            </button>
          )}
        </div>
        {flow.sessions.length > 0 && (
          <div className="flow-hero-card is-list">
            <span className="kicker">Erweiterte Messungen</span>
            <strong>Nur dieses Gerät</strong>
            <ul className="session-list">
              {flow.sessions.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void flow.openSaved(row.id)}>
                    <span>
                      {row.title} <DemoPill result={row.result} />
                    </span>
                    <small>{new Date(row.updatedAt).toLocaleString('de-DE')}</small>
                  </button>
                  <button type="button" className="ghost" onClick={() => void flow.removeSaved(row.id)} aria-label="Löschen">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flow-home-foot">
        <DiagnosePanel />
      </div>
    </div>
  )
}
