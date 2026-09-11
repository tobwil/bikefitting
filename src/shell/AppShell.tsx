import type { ReactNode } from 'react'
import { APP_NAME, GATE } from '../config/defaults.ts'

type AppShellProps = {
  stage: ReactNode
  camera?: ReactNode
  pose?: ReactNode
  calibration?: ReactNode
  pedal?: ReactNode
  metrics?: ReactNode
  soll?: ReactNode
  rules?: ReactNode
  sessions?: ReactNode
  rail?: ReactNode
  chrome?: ReactNode
  stageOverlay?: ReactNode
  note?: string
  gate?: string
  mode?: 'flow' | 'lab'
  step?: string
}

export function AppShell({
  stage,
  camera,
  pose,
  calibration,
  pedal,
  metrics,
  soll,
  rules,
  sessions,
  rail,
  chrome,
  stageOverlay,
  note = 'Local browser spike. No cloud analysis, no accounts. Productive Ampel only from approved rule profiles.',
  gate = GATE,
  mode = 'lab',
  step,
}: AppShellProps) {
  return (
    <div className="app" data-mode={mode} data-flow-step={step}>
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">{APP_NAME}</span>
          <span className="gate">{gate}</span>
        </div>
        <p className="mast-note">{note}</p>
      </header>
      {chrome}

      <main className="layout">
        <div className="stage" data-slot="stage">
          {stage}
          {stageOverlay}
        </div>
        <aside className="rail">
          {rail ?? (
            <>
              {camera}
              {pose}
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
