import type { Recommendation } from '../types.ts'

export function RecommendationList({ items }: { items: Recommendation[] }) {
  const ranked = [...items].sort((a, b) => a.priority - b.priority)
  const top = ranked[0]
  return (
    <section className="reco" data-reco>
      <p className="kicker">Priorisierte Empfehlung</p>
      {top ? (
        <>
          <h3>
            {top.priority}. {top.title}
          </h3>
          <p>{top.reason}</p>
          {top.deltaHint && <p className="reco-delta">Korrektur {top.deltaHint}</p>}
        </>
      ) : (
        <p>Keine Empfehlung.</p>
      )}
      {ranked.length > 1 && (
        <ol className="reco-rest">
          {ranked.slice(1).map((item) => (
            <li key={`${item.priority}-${item.title}`}>
              <strong>{item.title}</strong> — {item.reason}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
