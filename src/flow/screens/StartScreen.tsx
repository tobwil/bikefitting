import { useFlow } from '../FlowProvider.tsx'
import { AmpelNotice } from '../components/AmpelNotice.tsx'

export function StartScreen() {
  const flow = useFlow()
  return (
    <div className="flow-home" data-screen="start">
      <div className="flow-home-copy">
        <p className="kicker">P0 · UI-Flow</p>
        <h1>Passung im Seitenblick.</h1>
        <p className="lede">
          Eine lokale Chrome-Messung auf dem Mac. Keine Konten, kein Upload, keine produktive Ampel
          ohne freigegebenes Profil.
        </p>
        <AmpelNotice profile={flow.profile} />
      </div>

      <div className="flow-home-actions">
        <button type="button" className="flow-hero-card" onClick={flow.startNew} data-action="new-measure">
          <span className="kicker">01</span>
          <strong>Neue Messung</strong>
          <span>Kamera, B/S/G, Körperbezug, Aufnahme, Ergebnis.</span>
        </button>
        <div className="flow-hero-card is-list">
          <span className="kicker">Gespeicherte Messungen</span>
          <strong>Nur dieses Gerät</strong>
          {flow.sessions.length === 0 ? (
            <p className="muted">Noch nichts gespeichert. Ergebnisse bleiben in localStorage.</p>
          ) : (
            <ul className="session-list">
              {flow.sessions.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => void flow.openSaved(row.id)}>
                    {row.title}
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

      <p className="flow-home-foot">
        Adapter {flow.adaptersReady ? 'bereit' : 'laden'} · Sessions {flow.adapters.sessions.source} ·
        Chrome/Mac lokal
        <button type="button" className="text-link" onClick={() => flow.setMode('lab')}>
          Gate-A-Labor
        </button>
      </p>
    </div>
  )
}
