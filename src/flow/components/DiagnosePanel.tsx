import type { ReactNode } from 'react'
import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function DiagnosePanel({ extra }: { extra?: ReactNode } = {}) {
  const flow = useFlow()
  const fit = useFit()
  const cards = flow.result.cards.length > 0 ? flow.result.cards : flow.measure.cards
  return (
    <details className="diagnose" data-area="diagnose">
      <summary>Diagnose</summary>
      <dl className="diagnose-readout">
        <div>
          <dt>Worker</dt>
          <dd>{fit.pose.workerStatus}</dd>
        </div>
        <div>
          <dt>Adapter</dt>
          <dd>
            Sessions {flow.adapters.sessions.source} · Metriken {flow.adapters.metrics.source} · Regeln{' '}
            {flow.adapters.rules.source} · Soll {flow.adapters.soll.source}
            {flow.adapters.soll.source !== 'module' ? ' · STUB' : ''}
          </dd>
        </div>
        <div>
          <dt>Methoden</dt>
          <dd>
            {cards.length === 0
              ? '—'
              : cards
                  .map(
                    (card) =>
                      `${card.label}: ${card.method ?? '—'} · n ${card.usableCycles}${
                        card.detail ? ` · ${card.detail}` : ''
                      }`,
                  )
                  .join(' · ')}
          </dd>
        </div>
        <div>
          <dt>productionEnabled</dt>
          <dd>{String(flow.profile.productionEnabled)}</dd>
        </div>
        <div>
          <dt>Profil</dt>
          <dd>
            {flow.profile.name} ({flow.profile.id})
          </dd>
        </div>
        <div>
          <dt>Frame sync</dt>
          <dd>{fit.pose.frameSync}</dd>
        </div>
        <div>
          <dt>Harness</dt>
          <dd>Pedal / Metriken / Soll / Regeln nur im Gate-A-Labor</dd>
        </div>
        <div>
          <dt>1€-Overlay</dt>
          <dd>
            {fit.pose.overlayFilter.enabled ? 'Labor-Vergleich an' : 'aus (Default)'}
            {fit.pose.overlayFilter.compare.deltaDeg !== null
              ? ` · Δ ${fit.pose.overlayFilter.compare.deltaDeg.toFixed(2)}°`
              : ''}
            {fit.pose.overlayFilter.needsNewTake ? ' · neue Aufnahme' : ''}
          </dd>
        </div>
      </dl>
      <div className="diagnose-actions">
        <label className="overlay-filter-toggle">
          <input
            type="checkbox"
            checked={fit.pose.overlayFilter.enabled}
            onChange={(event) => fit.pose.overlayFilter.setEnabled(event.target.checked)}
          />
          1€-Overlay vergleichen (nicht für Metriken)
        </label>
        {ALLOW_SYNTHETIC_FIXTURE && (
          <button type="button" onClick={fit.camera.startSynthetic}>
            Synthetic
          </button>
        )}
        <button type="button" onClick={() => flow.setMode('lab')}>
          Gate-A-Labor
        </button>
      </div>
      {extra}
    </details>
  )
}
