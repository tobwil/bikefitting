import type { ReactNode } from 'react'
import { APP_NAME, GATE } from '../config/defaults.ts'
import { HelpPanel } from './HelpPanel.tsx'

type AppShellProps = {
  stage: ReactNode
  camera?: ReactNode
  pose?: ReactNode
  compare?: ReactNode
  calibration?: ReactNode
  pedal?: ReactNode
  metrics?: ReactNode
  soll?: ReactNode
  rules?: ReactNode
  sessions?: ReactNode
  rail?: ReactNode
  chrome?: ReactNode
  primary?: ReactNode
  stageOverlay?: ReactNode
  note?: string
  gate?: string
  mode?: 'flow' | 'lab'
  step?: string
  journey?: string
  measurePhase?: string
  capturePhase?: string
}

export function AppShell({
  stage,
  camera,
  pose,
  compare,
  calibration,
  pedal,
  metrics,
  soll,
  rules,
  sessions,
  rail,
  chrome,
  primary,
  stageOverlay,
  note = 'Local browser spike. No cloud analysis, no accounts. Productive Ampel only from approved rule profiles.',
  gate = GATE,
  mode = 'lab',
  step,
  journey,
  measurePhase,
  capturePhase,
}: AppShellProps) {
  return (
    <div className="app" data-mode={mode} data-flow-step={step} data-journey={journey} data-measure-phase={measurePhase} data-capture-phase={capturePhase}>
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">{APP_NAME}</span>
          <span className="gate">{gate}</span>
        </div>
        <p className="mast-note">{note}</p>
        <HelpPanel />
      </header>
      {chrome}

      <main className="layout">
        <div className="stage-column">
          {primary}
          <div className="stage" data-slot="stage">
            {stage}
            {stageOverlay}
          </div>
        </div>
        <aside className="rail">
          {rail ?? (
            <>
              {camera}
              {pose}
              {compare}
              {calibration}
              {pedal}
              {metrics}
              {soll}
              {rules}
              {sessions}
            </>
          )}
        </aside>
      </main>
    </div>
  )
}
