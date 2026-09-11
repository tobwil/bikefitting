import type { ReactNode } from 'react'
import { ALLOW_SYNTHETIC_FIXTURE } from '../../config/defaults.ts'
import { useFit } from '../../shell/FitSession.tsx'
import { useFlow } from '../FlowProvider.tsx'

export function DiagnosePanel({ extra }: { extra?: ReactNode } = {}) {
  const flow = useFlow()
  const fit = useFit()
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
      </dl>
      <div className="diagnose-actions">
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
