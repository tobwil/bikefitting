import type { ReactNode } from 'react'
import type { FlowFeedback } from '../feedback.ts'
import { StatusBanner } from './StatusBanner.tsx'

export function PrimaryBar({
  feedback,
  onRetry,
  primary,
  secondary,
}: {
  feedback: FlowFeedback
  onRetry?: () => void
  primary: ReactNode
  secondary?: ReactNode
}) {
  return (
    <div className="flow-primary" data-slot="primary">
      <StatusBanner feedback={feedback} onRetry={onRetry} />
      <div className="flow-primary-actions">
        {secondary}
        {primary}
      </div>
    </div>
  )
}
