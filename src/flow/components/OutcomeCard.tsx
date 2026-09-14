import type { OutcomeView } from '../outcome.ts'

const KIND_LABEL = {
  adjust: 'Einstellen',
  keep: 'Beibehalten',
  retake: 'Neu aufnehmen',
  review: 'Prüfen',
} as const

export function OutcomeCard({
  view,
  onPrimary,
}: {
  view: OutcomeView
  onPrimary: (code: OutcomeView['primary']['code']) => void
}) {
  const seat = view.seatDirection
  return (
    <section
      className="outcome-card"
      data-outcome-card
      data-action-kind={view.kind}
      data-action-released={view.released ? 'true' : 'false'}
      data-seat-direction={seat}
      data-primary-action={view.primary.code}
      data-capture-id={view.captureId}
      data-analysis-id={view.analysisId}
      data-method={view.method ?? ''}
      data-stub={view.stub ? 'true' : 'false'}
      data-observation-status={view.observationStatus ?? ''}
    >
      <p className="kicker">Ergebnis</p>
      <p className="outcome-kind" data-outcome-kind>
        {KIND_LABEL[view.kind]}
      </p>
      <h2 data-outcome-what>{view.what}</h2>
      <p className="outcome-how" data-action-how>
        {view.how}
      </p>
      <button
        type="button"
        className="is-active outcome-primary"
        data-action={`outcome-${view.primary.code}`}
        onClick={() => onPrimary(view.primary.code)}
      >
        {view.primary.label}
      </button>
      <p className="outcome-primary-hint">{view.primary.hint}</p>
      {!view.released && (
        <p className="reco-release" data-outcome-unreleased>
          Nicht fachlich freigegeben — keine Sattelrichtung für Einsteiger.
        </p>
      )}
      <details className="outcome-why" data-outcome-why>
        <summary>Warum?</summary>
        <dl>
          <div>
            <dt>Metrik</dt>
            <dd data-why-metrics>{view.why.metrics}</dd>
          </div>
          <div>
            <dt>Methode</dt>
            <dd data-why-method>{view.why.method}</dd>
          </div>
          <div>
            <dt>Belege</dt>
            <dd data-why-evidence>{view.why.evidence}</dd>
          </div>
          <div>
            <dt>Grenzen</dt>
            <dd data-why-limits>{view.why.limits}</dd>
          </div>
        </dl>
        <p data-action-why>{view.why.reasonText}</p>
      </details>
    </section>
  )
}
