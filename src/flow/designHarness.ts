import type { CapturePhase } from '../types/capture.ts'
import {
  BEGINNER_BODY_PX,
  BEGINNER_HEADER_STEPS,
  BEGINNER_TAP_PX,
  beginnerHeaderStep,
  beginnerShowsSollGhost,
  beginnerShell,
  recordingColorActive,
} from './beginnerJourney.ts'

export type DesignHarnessCase = { name: string; passed: boolean; detail: string }

function check(cases: DesignHarnessCase[], name: string, passed: boolean, detail: string) {
  cases.push({ name, passed, detail })
}

export function runDesignHarness(): { passed: boolean; message: string; cases: DesignHarnessCase[] } {
  const cases: DesignHarnessCase[] = []

  check(
    cases,
    'header is Einrichten · Aufnehmen · Ergebnis',
    BEGINNER_HEADER_STEPS.length === 3 &&
      BEGINNER_HEADER_STEPS[0]?.label === 'Einrichten' &&
      BEGINNER_HEADER_STEPS[1]?.label === 'Aufnehmen' &&
      BEGINNER_HEADER_STEPS[2]?.label === 'Ergebnis' &&
      BEGINNER_HEADER_STEPS.every((step) => step.label !== step.label.toUpperCase()),
    BEGINNER_HEADER_STEPS.map((step) => step.label).join(' · '),
  )

  check(
    cases,
    'countdown is Aufnehmen, not a fourth header step',
    beginnerHeaderStep({ flowStep: 'capture', capturePhase: 'countdown' }) === 'record' &&
      beginnerHeaderStep({ flowStep: 'capture', capturePhase: 'recording' }) === 'record' &&
      beginnerHeaderStep({ flowStep: 'capture', capturePhase: 'idle' }) === 'setup',
    'idle=setup countdown/recording=record',
  )

  check(
    cases,
    'analysis and documenting stay on Ergebnis',
    beginnerHeaderStep({ flowStep: 'capture', capturePhase: 'saved', analysisRunning: true }) === 'result' &&
      beginnerHeaderStep({ flowStep: 'result', documenting: true }) === 'result',
    'saved+analysis / documenting → result',
  )

  check(
    cases,
    'beginner never shows live Soll ghost as ideal pose',
    !beginnerShowsSollGhost({ entryPath: 'beginner', step: 'capture' }) &&
      !beginnerShowsSollGhost({ entryPath: 'beginner', step: 'result' }) &&
      !beginnerShowsSollGhost({ entryPath: 'beginner', step: 'measure' }) &&
      beginnerShowsSollGhost({ entryPath: 'expert', step: 'measure' }),
    'beginner off, expert measure on',
  )

  check(
    cases,
    'recording color only for Aufnahme läuft',
    recordingColorActive('recording') &&
      !recordingColorActive('countdown') &&
      !recordingColorActive('idle') &&
      !recordingColorActive('saved') &&
      !recordingColorActive('finalizing'),
    'recording only',
  )

  const phases: CapturePhase[] = ['idle', 'preparing', 'countdown', 'recording', 'finalizing', 'saved', 'cancelled', 'failed']
  check(
    cases,
    'capture phases are not extra header forms',
    phases.every((phase) => ['setup', 'record', 'result'].includes(beginnerHeaderStep({ flowStep: 'capture', capturePhase: phase }))),
    'all phases map to 3 steps',
  )

  check(
    cases,
    'type and tap targets meet AP-12 floor',
    BEGINNER_BODY_PX >= 16 && BEGINNER_TAP_PX >= 44,
    `${BEGINNER_BODY_PX}px body / ${BEGINNER_TAP_PX}px tap`,
  )

  check(
    cases,
    'beginner shell covers start, capture, beginner result',
    beginnerShell({ entryPath: 'beginner', step: 'start' }) &&
      beginnerShell({ entryPath: 'beginner', step: 'capture' }) &&
      beginnerShell({ entryPath: 'beginner', step: 'result' }) &&
      !beginnerShell({ entryPath: 'expert', step: 'calibrate' }),
    'shell mapping',
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    message: failed.length === 0 ? `DESIGN_HARNESS_OK — ${cases.length}` : `DESIGN_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
    cases,
  }
}
