import type { ActionDecision } from '../../types/action.ts'
import type { Recommendation } from '../types.ts'

const KIND_LABEL: Record<ActionDecision['kind'], string> = {
  adjust: 'Einstellen',
  keep: 'Beibehalten',
  retake: 'Neu aufnehmen',
  review: 'Prüfen',
}

export function RecommendationList({
  action,
  items = [],
  labLabeled = false,
}: {
  action?: ActionDecision | null
  items?: Recommendation[]
  labLabeled?: boolean
}) {
  if (action) {
    const seat =
      action.kind === 'adjust' && action.released && action.parameter && action.direction
    return (
      <section
        className="reco"
        data-reco
        data-action-kind={action.kind}
        data-action-released={action.released ? 'true' : 'false'}
        data-action-parameter={action.parameter ?? ''}
        data-action-direction={action.direction ?? ''}
        data-seat-direction={seat ? action.direction : 'none'}
        data-release-status={action.releaseStatus}
      >
        <p className="kicker">Nächste Handlung</p>
        <p className="reco-kind">{KIND_LABEL[action.kind]}</p>
        <h3>{action.template.what}</h3>
        <p data-action-why>{action.template.why}</p>
        <p className="reco-how" data-action-how>
          {action.template.how}
        </p>
        {!action.released && (
          <p className="reco-release">Nicht fachlich freigegeben — keine Sattelrichtung für Einsteiger.</p>
        )}
      </section>
    )
  }

  const ranked = [...items].sort((a, b) => a.priority - b.priority)
  const top = ranked[0]
  return (
    <section className="reco" data-reco data-lab-labeled={labLabeled ? 'true' : 'false'}>
      <p className="kicker">{labLabeled ? 'Labor · vorläufige Empfehlung' : 'Priorisierte Empfehlung'}</p>
      {labLabeled && (
        <p className="reco-release">Laborpfad — nicht der Einsteiger-ActionDecision-Vertrag.</p>
      )}
      {top ? (
        <>
          <h3>
            {top.priority}. {top.title}
          </h3>
          <p>{top.reason}</p>
          {top.deltaHint && <p className="reco-delta">Korrektur {top.deltaHint}</p>}
        </>
      ) : (
        <p>Keine Handlung.</p>
      )}
      {ranked.length > 1 && (
        <ul className="reco-rest">
          {ranked.slice(1).map((item) => (
            <li key={`${item.priority}-${item.title}`}>
              <strong>
                {item.priority}. {item.title}
              </strong>{' '}
              — {item.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
