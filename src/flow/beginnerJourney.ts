import type { CapturePhase } from '../types/capture.ts'
import type { FlowStepId } from './constants.ts'

export type BeginnerEntryPath = 'beginner' | 'expert'

/** Briefing V2 flow A–E maps onto three header steps. Countdown/analysis are states, not forms. */
export const BEGINNER_HEADER_STEPS = [
  { id: 'setup', label: 'Einrichten' },
  { id: 'record', label: 'Aufnehmen' },
  { id: 'result', label: 'Ergebnis' },
] as const

export type BeginnerHeaderId = (typeof BEGINNER_HEADER_STEPS)[number]['id']

export const BEGINNER_BODY_PX = 16
export const BEGINNER_TAP_PX = 44

/** Recording chrome color is reserved for this phase only. */
export const RECORDING_COLOR_PHASE: CapturePhase = 'recording'

export function beginnerHeaderStep(input: {
  flowStep: FlowStepId
  capturePhase?: CapturePhase | null
  analysisRunning?: boolean
  documenting?: boolean
}): BeginnerHeaderId {
  if (input.flowStep === 'result') return 'result'
  if (input.flowStep === 'start') return 'setup'
  if (input.flowStep === 'capture') {
    const phase = input.capturePhase
    if (phase === 'countdown' || phase === 'recording' || phase === 'finalizing') return 'record'
    if (phase === 'saved' || input.analysisRunning) return 'result'
    return 'setup'
  }
  if (input.flowStep === 'measure') return 'record'
  if (input.flowStep === 'camera' || input.flowStep === 'calibrate' || input.flowStep === 'body') return 'setup'
  return 'result'
}

/** Live cyan Soll / current-setup ghost is expert-only. Beginner never treats it as an ideal pose. */
export function beginnerShowsSollGhost(input: { entryPath: BeginnerEntryPath; step: FlowStepId }): boolean {
  if (input.entryPath === 'beginner') return false
  if (input.step === 'capture' || input.step === 'start') return false
  return input.step === 'measure' || input.step === 'body' || input.step === 'result'
}

export function beginnerShell(input: { entryPath: BeginnerEntryPath; step: FlowStepId }): boolean {
  return input.entryPath === 'beginner' || input.step === 'capture' || input.step === 'start'
}

export function recordingColorActive(phase: CapturePhase | null | undefined): boolean {
  return phase === RECORDING_COLOR_PHASE
}
