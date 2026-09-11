import { SOLL_INFEASIBLE_COPY, SOLL_SEGMENT_ORDER } from '../types/soll.ts'
import type { BodyModel, SollSolveResult, SollUiState } from '../types/soll.ts'
import type { SollHarnessResult } from './harness.ts'

export type SollPanelProps = {
  result?: SollSolveResult
  ui?: SollUiState
  body?: BodyModel | null
  setUi?: (patch: Partial<SollUiState>) => void
  onMeasureIst?: () => void
  onResetEstimated?: () => void
  onRunHarness?: () => void
  harness?: SollHarnessResult | null
  istReady?: boolean
}

function statusClass(status: string | undefined): string | undefined {
  if (status === 'feasible') return 'ok'
  if (status === 'infeasible' || status === 'timeout') return 'lost'
  return undefined
}

export function SollPanel({
  result,
  ui,
  body = null,
  setUi,
  onMeasureIst,
  onResetEstimated,
  onRunHarness,
  harness = null,
  istReady = false,
}: SollPanelProps) {
  const status = result?.status ?? 'insufficient_input'
  const infeasible = status === 'infeasible' || status === 'timeout'
  const scale = ui?.limbScale ?? 1
  const phase = result?.phase01

  return (
    <section className="module-slot" data-module="soll" data-soll-status={status}>
      <header>
        <p className="kicker">Soll skeleton · E5 P0</p>
        <h2 className={statusClass(status)}>{status}</h2>
      </header>
      <p>
        Ghost on the <strong>current</strong> B/S/G setup. Bones stay rigid. Mode{' '}
        <code>adjustment_simulation</code> is P1 and is not faked here.
      </p>

      {infeasible && <p className="lost-banner soll-infeasible">{SOLL_INFEASIBLE_COPY}</p>}

      <dl className="readout compact">
        <div>
          <dt>Mode</dt>
          <dd>current_setup</dd>
        </div>
        <div>
          <dt>Phase</dt>
          <dd>{phase !== null && phase !== undefined ? phase.toFixed(3) : '—'}</dd>
        </div>
        <div>
          <dt>Lengths</dt>
          <dd>{result?.usedEstimatedLengths ? 'estimated' : 'measured'}</dd>
        </div>
        <div>
          <dt>Solve</dt>
          <dd>{result ? `${result.elapsedMs.toFixed(1)} ms` : '—'}</dd>
        </div>
      </dl>

      {result?.reasons[0] && !infeasible && (
        <p className="status-idle">{result.reasons[0].message}</p>
      )}
      {infeasible &&
        result?.reasons.map((r) => (
          <p key={r.code} className="status-idle">
            {r.message}
          </p>
        ))}

      <div className="btn-row">
        <button
          type="button"
          className={ui?.showGhost ? 'is-active' : undefined}
          onClick={() => setUi?.({ showGhost: !ui?.showGhost })}
        >
          Ghost
        </button>
        <button
          type="button"
          className={ui?.showCorridor ? 'is-active' : undefined}
          onClick={() => setUi?.({ showCorridor: !ui?.showCorridor })}
        >
          Corridor
        </button>
        <button
          type="button"
          className={ui?.phaseSource === 'pedal' ? 'is-active' : undefined}
          onClick={() => setUi?.({ phaseSource: 'pedal' })}
        >
          Pedal phase
        </button>
        <button
          type="button"
          className={ui?.phaseSource === 'synthetic' ? 'is-active' : undefined}
          onClick={() => setUi?.({ phaseSource: 'synthetic', syntheticPlaying: true })}
        >
          Synthetic phase
        </button>
      </div>

      {ui?.phaseSource === 'synthetic' && (
        <label className="field">
          Synthetic phase
          <input
            type="range"
            min={0}
            max={1}
            step={0.002}
            value={ui.syntheticPlaying ? (phase ?? ui.syntheticPhase01) : ui.syntheticPhase01}
            onChange={(event) =>
              setUi?.({
                syntheticPhase01: Number(event.target.value),
                syntheticPlaying: false,
              })
            }
          />
          <span className="btn-row">
            <button
              type="button"
              className={ui.syntheticPlaying ? 'is-active' : undefined}
              onClick={() => setUi?.({ syntheticPlaying: !ui.syntheticPlaying })}
            >
              {ui.syntheticPlaying ? 'Pause' : 'Play'}
            </button>
          </span>
        </label>
      )}

      <label className="field">
        Segment scale (debug)
        <input
          type="range"
          min={0.25}
          max={1.25}
          step={0.01}
          value={scale}
          onChange={(event) => setUi?.({ limbScale: Number(event.target.value) })}
        />
        <span>{scale.toFixed(2)}× — drag down to demo infeasible</span>
      </label>

      <div className="btn-row">
        <button type="button" onClick={onMeasureIst} disabled={!istReady}>
          Measure from Ist
        </button>
        <button type="button" onClick={onResetEstimated}>
          Reset estimated
        </button>
        <button type="button" onClick={onRunHarness}>
          Soll harness
        </button>
      </div>

      {body && (
        <ul className="soll-segs">
          {SOLL_SEGMENT_ORDER.map((id) => {
            const seg = body.segments.find((s) => s.id === id)
            if (!seg) return null
            return (
              <li key={id}>
                <code>{id}</code>
                <span>{(seg.lengthPx * scale).toFixed(0)} px</span>
                <em className={seg.source === 'estimated' ? 'soll-est' : 'ok-note'}>{seg.source}</em>
              </li>
            )
          })}
        </ul>
      )}

      {harness && <p className={harness.passed ? 'ok-note' : 'status-idle'}>{harness.message}</p>}
    </section>
  )
}
