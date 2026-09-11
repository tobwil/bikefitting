import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { AmpelNotice } from '../components/AmpelNotice.tsx'
import { DemoPill, StorageErrorNotice } from '../components/DemoBanner.tsx'

export function StartScreen() {
  const flow = useFlow()
  return (
    <div className="flow-home" data-screen="start">
      <div className="flow-home-copy">
        <p className="kicker">Lokale Messung</p>
        <h1>Passung im Seitenblick.</h1>
        <p className="lede">
          Eine Messung auf diesem Mac, in Chrome. Keine Konten, kein Upload. Die Kamera geht erst nach
          deinem Klick an — ohne Mikrofon.
        </p>
        <ol className="flow-explain">
          <li>Rad seitlich auf den Trainer, Hoods, ganze Beinlinie im Bild.</li>
          <li>Tretlager, Sattel und Lenker markieren.</li>
          <li>Wenn die Person erkannt ist: Pedalmarker im Bild halten.</li>
          <li>Countdown — nicht auf den Bildschirm schauen. Ein Ton markiert Start und Ende.</li>
          <li>Ergebnis und Messdaten bleiben auf diesem Gerät.</li>
        </ol>
        <AmpelNotice profile={flow.profile} />
        <StorageErrorNotice message={flow.storageError} />
      </div>

      <div className="flow-home-actions">
        <button type="button" className="flow-hero-card" onClick={flow.startNew} data-action="new-measure">
          <span className="kicker">Messung</span>
          <strong>Mit Kamera messen</strong>
          <span>Eigene Webcam oder iPhone neben dem Rad. Die App läuft nur auf dem Mac.</span>
        </button>
        {ALLOW_SYNTHETIC_FIXTURE ? (
          <button type="button" className="flow-hero-card is-demo" onClick={flow.startDemo} data-action="try-demo">
            <span className="kicker">Ohne Kamera</span>
            <strong>Demo ausprobieren</strong>
            <span>Beispielaufnahme zum Kennenlernen der Schritte — keine eigene Kamera nötig.</span>
          </button>
        ) : (
          <div className="flow-hero-card is-list">
            <span className="kicker">Ohne Kamera</span>
            <strong>Demo nicht verfügbar</strong>
            <p className="muted">Die Beispielaufnahme gibt es in der Entwicklungsversion.</p>
          </div>
        )}
        <div className="flow-hero-card is-list">
          <span className="kicker">Gespeicherte Messungen</span>
          <strong>Nur dieses Gerät</strong>
          {flow.sessions.length === 0 ? (
            <p className="muted">Noch nichts gespeichert.</p>
          ) : (
            <ul className="session-list">
              {flow.sessions.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void flow.openSaved(row.id)}>
                    <span>
                      {row.title} <DemoPill result={row.result} />
                    </span>
                    <small>{new Date(row.updatedAt).toLocaleString('de-DE')}</small>
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void flow.removeSaved(row.id)}
                    aria-label="Löschen"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flow-home-foot">
        <DiagnosePanel />
      </div>
    </div>
  )
}
