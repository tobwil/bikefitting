import { COPY as ACTION_COPY, assertSafeActionTemplate, type ActionCopyVars, fillCopy } from '../action/copy.ts'
import type { ActionTemplate } from '../types/action.ts'

export { ACTION_COPY, assertSafeActionTemplate, fillCopy }
export type { ActionCopyVars }

export const OUTCOME_COPY = {
  reviewStub: {
    what: 'Noch keine Knieauswertung — Clip ist gespeichert.',
    why: 'Die markerfreie Methode ist in dieser Version nicht eingebaut. Es gibt keine erfundene Zahl und keine Satteländerung.',
    how: 'Denselben Clip später erneut auswerten. Neu aufnehmen nur wenn der Ausschnitt unsicher war.',
  },
  reviewFailed: {
    what: 'Auswertung fehlgeschlagen — Clip ist gespeichert.',
    why: '{reasonText}',
    how: 'Gespeichertes Video erneut auswerten. Keine neue Kameraaufnahme nötig, der Clip bleibt erhalten.',
  },
  reviewIncomplete: {
    what: 'Auswertung unvollständig — keine Sitzeinstellung.',
    why: '{reasonText}',
    how: 'Denselben Clip erneut auswerten. Fehlende Kernmetrik wird nicht durch eine beruhigende Zusammenfassung ersetzt.',
  },
  retakeIncompleteCapture: {
    what: 'Aufnahme wiederholen — Clip unvollständig.',
    why: '{reasonText}',
    how: 'Neue Aufnahme. Der unvollständige Clip gilt nicht als ausgewertetes Ergebnis.',
  },
  retakeMissingCore: {
    what: 'Aufnahme wiederholen — Knie nicht auswertbar.',
    why: '{reasonText}',
    how: 'Seitliche Kamera, Hüfte–Knie–Knöchel derselben Seite vollständig im Bild. Danach neu aufnehmen.',
  },
} as const satisfies Record<string, ActionTemplate>

export type OutcomeCopyVars = ActionCopyVars & { reasonText: string }

export function fillOutcome(template: string, vars: OutcomeCopyVars): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => {
    if (key in vars) return String(vars[key as keyof OutcomeCopyVars])
    return whole
  })
}

export function fillOutcomeTemplate(base: ActionTemplate, vars: OutcomeCopyVars): ActionTemplate {
  const filled: ActionTemplate = {
    what: fillOutcome(base.what, vars),
    why: fillOutcome(base.why, vars),
    how: fillOutcome(base.how, vars),
  }
  assertSafeActionTemplate(filled)
  return filled
}
