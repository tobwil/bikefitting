import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { QualityBlock } from '../components/AmpelNotice.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { RecommendationList } from '../components/RecommendationList.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function ResultScreen() {
  const flow = useFlow()
  const quality = flow.result.quality
  return (
    <div className="flow-screen" data-screen="result">
      <section className="module-slot">
        <p className="kicker">06 · Ergebnis</p>
        <h2>Lokal, ohne Upload</h2>
        <p>Messdaten bleiben auf diesem Gerät. Keine Cloud, kein Konto.</p>
        {quality ? (
          <QualityBlock label={quality.label} level={quality.level} notes={quality.notes} ampel={flow.ampel} />
        ) : (
          <p>Noch keine Auswertung. Messung laufen lassen oder eine gespeicherte Session öffnen.</p>
        )}
      </section>
      <section className="module-slot metric-rail">
        {flow.result.cards.slice(0, 3).map((card) => (
          <MetricCard key={card.id} card={card} ampel={flow.ampel} />
        ))}
      </section>
      <RecommendationList items={flow.result.recommendations} />
      <div className="flow-rail-actions">
        <button type="button" data-action="save-local" onClick={() => void flow.saveCurrent()} disabled={!quality}>
          Lokal speichern
        </button>
        <button type="button" data-action="export-json" onClick={flow.exportCurrent} disabled={!quality}>
          JSON exportieren
        </button>
        <button type="button" data-action="export-md" onClick={flow.exportCurrentMarkdown} disabled={!quality}>
          Markdown exportieren
        </button>
      </div>
      <DiagnosePanel />
    </div>
  )
}
