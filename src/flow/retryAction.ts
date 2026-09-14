import type { FlowFeedback } from './feedback.ts'

export type RetryKind = 'camera' | 'pose' | 'pedal' | 'none'

/** Status-banner retry must restore the failing module, not always the camera. */
export function retryKindForFeedback(feedback: Pick<FlowFeedback, 'id'>): RetryKind {
  if (feedback.id === 'camera-error') return 'camera'
  if (feedback.id === 'pose-error') return 'pose'
  if (feedback.id === 'pick-pedal') return 'pedal'
  return 'none'
}

export function retryHandler(kind: RetryKind, actions: {
  reconnectCamera: () => void
  restartPose: () => void
  reselectPedal: () => void
}): (() => void) | undefined {
  if (kind === 'camera') return actions.reconnectCamera
  if (kind === 'pose') return actions.restartPose
  if (kind === 'pedal') return actions.reselectPedal
  return undefined
}
