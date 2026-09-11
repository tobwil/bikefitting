import type { FlowFeedback } from '../feedback.ts'

export function StatusBanner({
  feedback,
  onRetry,
}: {
  feedback: FlowFeedback
  onRetry?: () => void
}) {
  const showRetry = Boolean(feedback.retryLabel && onRetry)
  return (
    <div className={`status-banner is-${feedback.tone}`} data-feedback={feedback.id} role="status">
      <div>
        <strong>{feedback.title}</strong>
        {feedback.detail && <p>{feedback.detail}</p>}
      </div>
      {showRetry && (
        <button type="button" className="status-retry" onClick={onRetry}>
          {feedback.retryLabel}
        </button>
      )}
    </div>
  )
}
