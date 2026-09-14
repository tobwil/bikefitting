import { FootPanel } from '../../foot/FootPanel.tsx'
import { DiagnosePanel } from '../components/DiagnosePanel.tsx'
import { AmpelNotice, QualityBlock } from '../components/AmpelNotice.tsx'
import { DemoBanner, ResultProvenance, StorageErrorNotice } from '../components/DemoBanner.tsx'
import { MetricCard } from '../components/MetricCard.tsx'
import { RecommendationList } from '../components/RecommendationList.tsx'
import { PhaseEvidencePanel } from '../components/PhaseEvidence.tsx'
import { OutcomeCard } from '../components/OutcomeCard.tsx'
import { useFlow } from '../FlowProvider.tsx'
import { ampelAllowed } from '../profile.ts'
import { isDemoResult } from '../types.ts'
import { actionFromMeasurementResult } from '../../action/present.ts'
import { outcomeView, type OutcomeView } from '../outcome.ts'

export function ResultScreen() {
  const flow = useFlow()
  const dataset = flow.result.dataset
  const quality = flow.result.quality
  const demo = isDemoResult(dataset)
  const resultProfile = dataset?.profile ?? flow.profile
  const resultAmpel = dataset ? ampelAllowed(dataset.profile) : flow.ampel
  const action = dataset ? actionFromMeasurementResult(dataset) : null
  const analyzing = flow.analysis.status === 'running'
  const view: OutcomeView | null = action
    ? outcomeView({
        action,
        observation: dataset?.observation,
        hasCaptureAsset: flow.entryPath === 'beginner' && Boolean(dataset?.observation || dataset?.captureId || flow.pendingCaptureId),
        expert: flow.entryPath === 'expert',
      })
    : null

  const onPrimary = (code: OutcomeView['primary']['code']) => {
    if (code === 'save') void flow.saveCurrent()
    else if (code === 'retake') flow.retakeCapture()
    else if (code === 'reanalyze') void flow.reanalyzeCurrent()
    else if (code === 'remeasure') flow.remeasure()
    else flow.goTo('start')
  }

  return (
    <div
      className="flow-screen"
      data-screen="result"
      data-demo={demo ? 'true' : 'false'}
      data-source={dataset?.source ?? ''}
      data-entry={flow.entryPath}
    >
      <StorageErrorNotice message={flow.storageError} />
      {analyzing && !dataset && (
        <section className="result-analyzing" data-analysis-status="running">
          <p className="kicker">Aufnahme gespeichert</p>
          <h2>Wird ausgewertet</h2>
          <p>Video ist lokal gespeichert. Die Auswertung läuft getrennt davon — ohne erfundene Zahl.</p>
        </section>
      )}
      {view && <OutcomeCard view={view} onPrimary={onPrimary} />}
      {!view && !analyzing && (
        <section className="module-slot">
          <p className="kicker">06 · Ergebnis</p>
          <h2>Lokal, ohne Upload</h2>
          <p>Noch keine Auswertung. Messung laufen lassen, einen Clip auswerten oder eine gespeicherte Session öffnen.</p>
        </section>
      )}
      <details className="result-details" data-area="result-details">
        <summary>Details</summary>
        <section className="module-slot">
          <p>Messdaten bleiben auf diesem Gerät. Keine Cloud, kein Konto.</p>
          <DemoBanner result={dataset} />
          <AmpelNotice profile={resultProfile} />
          <ResultProvenance result={dataset} />
          {quality ? (
            <QualityBlock label={quality.label} level={quality.level} notes={quality.notes} ampel={resultAmpel} />
          ) : (
            <p>Keine Qualitätsdaten in diesem Datensatz.</p>
          )}
        </section>
        <section className="module-slot metric-rail">
          {flow.result.cards.slice(0, 3).map((card) => (
            <MetricCard key={card.id} card={card} ampel={resultAmpel} />
          ))}
        </section>
        {dataset && (
          <section className="module-slot" data-result-scale={dataset.scale?.status ?? 'absent'}>
            <p className="kicker">Maßstab</p>
            <h2>
              {dataset.scale?.status === 'checked'
                ? 'Geprüft — keine mm-Produktzusage'
                : 'Nicht bestätigt — keine Längenangaben'}
            </h2>
            <p>{dataset.scale?.notes[0] ?? 'Kein Maßstab auf diesem Ergebnis. Bildabstände sind kein Sattelmaß.'}</p>
          </section>
        )}
        {dataset?.foot && <FootPanel diagnostic={dataset.foot} />}
        {dataset && (
          <PhaseEvidencePanel
            result={dataset}
            sessions={flow.sessions}
            currentId={flow.result.session?.id ?? dataset.id}
            currentLabel={flow.result.session?.title ?? 'aktuell'}
            onDeleteImages={() => void flow.deletePhaseImages()}
          />
        )}
        <RecommendationList action={action} labLabeled={flow.entryPath === 'expert'} />
        <div className="flow-rail-actions">
          <button type="button" data-action="save-local" onClick={() => void flow.saveCurrent()} disabled={!quality}>
            JSON-Session speichern
          </button>
          <button type="button" data-action="export-json" onClick={flow.exportCurrent} disabled={!quality}>
            JSON exportieren
          </button>
          <button type="button" data-action="export-md" onClick={flow.exportCurrentMarkdown} disabled={!quality}>
            Markdown exportieren
          </button>
        </div>
        <DiagnosePanel />
      </details>
    </div>
  )
}
