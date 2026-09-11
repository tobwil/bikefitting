import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { AmpelNotice, QualityBlock } from '../components/AmpelNotice.tsx'
import { DemoBanner, ResultProvenance, StorageErrorNotice } from '../components/DemoBanner.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { RecommendationList } from '../components/RecommendationList.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { isDemoResult } from '../types.ts'

export function ResultScreen() {
  const flow = useFlow()
  const dataset = flow.result.dataset
  const quality = flow.result.quality
  const demo = isDemoResult(dataset)
  return (
    <div className="flow-screen" data-screen="result" data-demo={demo ? 'true' : 'false'}>
      <section className="module-slot">
        <p className="kicker">06 · Ergebnis</p>
        <h2>Lokal, ohne Upload</h2>
        <p>Messdaten bleiben auf diesem Gerät. Keine Cloud, kein Konto.</p>
        <DemoBanner result={dataset} />
        <AmpelNotice profile={flow.profile} />
        <ResultProvenance result={dataset} />
        <StorageErrorNotice message={flow.storageError} />
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
