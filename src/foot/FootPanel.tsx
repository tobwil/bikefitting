import type { FootCycleDiagnostic } from '../types/foot.ts'
import './foot.css'

export function FootPanel({ diagnostic }: { diagnostic: FootCycleDiagnostic }) {
  return (
    <section
      className="module-slot foot-panel"
      data-module="foot"
      data-foot-status={diagnostic.status}
      data-foot-locked={diagnostic.metricLocked ? 'true' : 'false'}
      data-foot-length={diagnostic.lengthClaimsAllowed ? 'true' : 'false'}
    >
      <header>
        <p className="kicker">Fuß · Diagnose</p>
        <h2>Ferse und Zehenspitze über den Zyklus</h2>
      </header>
      <div className="foot-pair">
        <div className="foot-chip" data-occluded={diagnostic.heelOccluded ? 'true' : 'false'}>
          <strong>Ferse</strong>
          <span>{diagnostic.heelOccluded ? 'verdeckt' : diagnostic.overlay.heelVisible ? 'sichtbar' : '—'}</span>
        </div>
        <div className="foot-chip" data-occluded={diagnostic.toeOccluded ? 'true' : 'false'}>
          <strong>Zehenspitze</strong>
          <span>{diagnostic.toeOccluded ? 'verdeckt' : diagnostic.overlay.toeVisible ? 'sichtbar' : '—'}</span>
        </div>
      </div>
      {diagnostic.metricLocked && (
        <p className="foot-lock" data-foot-lock>
          {diagnostic.reason}
        </p>
      )}
      {!diagnostic.metricLocked && <p className="foot-note">{diagnostic.reason}</p>}
      <p className="foot-note">
        {diagnostic.usableSamples} nutzbar · {diagnostic.occludedSamples} verdeckt · n {diagnostic.samples}. Keine
        neue Metrikkarte, keine Empfehlung in dieser Stufe.
      </p>
      {!diagnostic.lengthClaimsAllowed && (
        <p className="foot-note" data-foot-no-length>
          Ohne bestätigten Maßstab keine Längenangabe.
        </p>
      )}
    </section>
  )
}
