import type { ReactNode } from 'react'
import { APP_NAME, GATE } from '../config/defaults.ts'

type AppShellProps = {
  stage: ReactNode
  camera: ReactNode
  pose: ReactNode
  calibration: ReactNode
  pedal: ReactNode
  metrics: ReactNode
  soll: ReactNode
  rules?: ReactNode
  sessions: ReactNode
}

export function AppShell({ stage, camera, pose, calibration, pedal, metrics, soll, rules, sessions }: AppShellProps) {
  return (
    <div className="app">
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">{APP_NAME}</span>
          <span className="gate">{GATE}</span>
        </div>
        <p className="mast-note">
          Local browser spike. No cloud analysis, no accounts. Productive Ampel only from approved rule profiles.
        </p>
      </header>

      <main className="layout">
        <div className="stage" data-slot="stage">
          {stage}
        </div>
        <aside className="rail">
          {camera}
          {pose}
          {calibration}
          {pedal}
          {metrics}
          {soll}
          {rules}
          {sessions}
        </aside>
      </main>
    </div>
  )
}
