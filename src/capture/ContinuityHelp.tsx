export function ContinuityHelp({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? 'continuity-help is-compact' : 'continuity-help'} data-continuity-help>
      <p className="kicker">Kein iPhone als Kamera</p>
      <h2>Continuity Camera in vier Schritten</h2>
      <p className="continuity-lead">
        Die Systemrechte bleiben bei dir: Kamera in Chrome und Continuity in macOS selbst einschalten.
      </p>
      <ol className="continuity-steps">
        <li>
          <ContinuityNearMac />
          <span>iPhone entsperrt, nah am Mac.</span>
        </li>
        <li>
          <ContinuityLandscape />
          <span>Querformat, hintere Kamera zum Fahrer.</span>
        </li>
        <li>
          <ContinuityToggle />
          <span>Continuity Camera am Mac einschalten.</span>
        </li>
        <li>
          <ContinuityUsb />
          <span>Wenn Funk hakelt: iPhone per USB, Vertrauen tippen.</span>
        </li>
      </ol>
    </section>
  )
}

function ContinuityNearMac() {
  return (
    <svg viewBox="0 0 72 48" aria-hidden="true" className="continuity-icon">
      <rect x="4" y="18" width="36" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="22" width="28" height="14" fill="currentColor" opacity="0.2" />
      <rect x="44" y="8" width="18" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="53" cy="14" r="2.2" fill="currentColor" />
      <path d="M40 28h4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function ContinuityLandscape() {
  return (
    <svg viewBox="0 0 72 48" aria-hidden="true" className="continuity-icon">
      <rect x="8" y="14" width="56" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="27" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M34 32c6-10 16-10 22 0" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="40" cy="22" r="2" fill="currentColor" />
    </svg>
  )
}

function ContinuityToggle() {
  return (
    <svg viewBox="0 0 72 48" aria-hidden="true" className="continuity-icon">
      <rect x="10" y="16" width="52" height="18" rx="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="25" r="7" fill="currentColor" />
    </svg>
  )
}

function ContinuityUsb() {
  return (
    <svg viewBox="0 0 72 48" aria-hidden="true" className="continuity-icon">
      <path d="M12 24h28" stroke="currentColor" strokeWidth="2" />
      <rect x="40" y="18" width="18" height="12" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M58 21v6M12 21v6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
