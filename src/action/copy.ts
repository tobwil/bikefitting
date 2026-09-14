import type { ActionTemplate } from '../types/action.ts'

const EXACT_MM = /\d+(?:[.,]\d+)?\s*mm\b/i
const EXAKT_SATTEL = /sattel\s+exakt/i
const ANGLE_TO_MM = /(?:°|grad).{0,24}(?:mm|millimeter)/i

export class ActionCopyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionCopyError'
  }
}

export function assertSafeActionTemplate(template: ActionTemplate, field = 'template'): void {
  for (const [key, text] of Object.entries(template)) {
    if (EXACT_MM.test(text) || EXAKT_SATTEL.test(text) || ANGLE_TO_MM.test(text)) {
      throw new ActionCopyError(`${field}.${key} must not guess millimetres or exact saddle moves`)
    }
  }
}

export type ActionCopyVars = {
  valueDeg: string
  methodLabel: string
  ruleId: string
  releaseStatus: string
  cycles: string
  targetDeg: string
  lowBound: string
  highBound: string
}

export function fillCopy(template: string, vars: ActionCopyVars): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => {
    if (key in vars) return vars[key as keyof ActionCopyVars]
    return whole
  })
}

export function formatReportNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function methodLabel(method: string | null | undefined): string {
  if (method === 'bottom_dead_center') return 'am unteren Pedaltotpunkt'
  if (method === 'cycle_mean') return 'als Mittelwert über den Tretzyklus'
  if (method === 'max_extension') return 'nahe größter Streckung'
  if (!method) return 'ohne festgelegte Methode'
  return method
}

export const COPY = {
  retakeMissingKnee: {
    what: 'Aufnahme wiederholen — Knie nicht auswertbar.',
    why: 'Es liegt keine belastbare Kniebeobachtung vor. Ohne diese Kernmetrik gibt es keine Satteländerung.',
    how: 'Seitliche Kamera, Hüfte–Knie–Knöchel derselben Seite vollständig im Bild. Danach denselben Ablauf erneut messen.',
  },
  retakeQuality: {
    what: 'Aufnahme wiederholen — Messqualität reicht nicht.',
    why: 'Die Qualität der Messung reicht nicht für eine Handlung. Zahlen aus einem schwachen Abschnitt werden nicht in eine Satteländerung übersetzt.',
    how: 'Ruhiger seitlicher Ausschnitt, genug vollständige Umdrehungen, dann erneut messen und mit der gespeicherten Basis vergleichen.',
  },
  reviewUnreleased: {
    what: 'Keine Sitzeinstellung aus diesem Profil ableiten.',
    why: 'Beobachtet wurden {valueDeg}° Kniebeugung {methodLabel} (n={cycles}). Regel {ruleId} ist {releaseStatus} und nicht fachlich freigegeben.',
    how: 'Beobachtung und Belege lokal speichern. Keine Satteländerung aus dieser Zahl. Bei Bedarf mit einem Fitter prüfen.',
  },
  reviewUnreleasedNoValue: {
    what: 'Keine Sitzeinstellung — Profil nicht freigegeben.',
    why: 'Regel {ruleId} ist {releaseStatus} und nicht productionEnabled. Einsteiger erhalten daraus keine Sattelrichtung.',
    how: 'Ergebnis als Beobachtung behalten. Keine Satteländerung raten, bis ein fachlich freigegebenes Profil vorliegt.',
  },
  reviewUnsupportedMethod: {
    what: 'Methode wird für eine Sitzeinstellung nicht unterstützt.',
    why: 'Die Beobachtung nutzt {methodLabel}. Dafür gibt es kein freigegebenes Einsteiger-Profil. Ein fremdes Zielband wird nicht übernommen.',
    how: 'Keine Satteländerung aus dieser Methode. Beobachtung speichern oder mit einer unterstützten, freigegebenen Methode erneut messen.',
  },
  reviewMarkerless: {
    what: 'Markerfreie Kniebeobachtung — noch keine Einstellregel.',
    why: 'Für die Methode nahe größter Streckung liegt kein freigegebenes Profil vor. Ein vorläufiges Totpunkt-Zielband wird nicht übernommen.',
    how: 'Die Beobachtung bleibt eine Beobachtung. Keine Sattelrichtung, bis die Methode fachlich freigegeben ist.',
  },
  reviewLens: {
    what: 'Keine Sitzeinstellung — Linse nicht validiert.',
    why: 'Die Aufnahmegeometrie (Linse / Ausschnitt) ist nicht als geprüft hinterlegt. Winkel werden nicht in eine Sattelrichtung übersetzt.',
    how: 'Gleiche Kamera und ruhigen seitlichen Ausschnitt sichern, dann erneut aufnehmen oder mit einem Fitter prüfen.',
  },
  reviewContext: {
    what: 'Keine Sitzeinstellung — Aufnahmekontext nicht unterstützt.',
    why: 'Die Szene (Perspektive oder Kontext) ist für eine Richtungsempfehlung nicht freigegeben.',
    how: 'Seitlich, ruhige Kamera, gleiche Position als Basis sichern und erneut messen.',
  },
  reviewContradiction: {
    what: 'Keine erzwungene Einstellung — Belege widersprechen sich.',
    why: 'Es liegen widersprüchliche Hinweise vor. Daraus wird keine Sattelrichtung abgeleitet.',
    how: 'Belege vergleichen, Aufnahmebedingungen sichern und bei Bedarf mit einem Fitter prüfen. Keine Satteländerung erzwingen.',
  },
  reviewPain: {
    what: 'Keine erzwungene Einstellung — Schmerz oder Unsicherheit gemeldet.',
    why: 'Bei Schmerz oder widersprüchlichem Befund gibt es keine automatische Sattelrichtung.',
    how: 'Aktuelle Position belassen oder mit einem Fitter klären. Nicht nach Winkel ins Millimetermaß raten.',
  },
  reviewGeneric: {
    what: 'Ergebnis prüfen — keine automatische Sitzeinstellung.',
    why: 'Die Voraussetzungen für eine freigegebene Handlung sind nicht erfüllt.',
    how: 'Beobachtung speichern. Keine Satteländerung aus unfreigegebenen oder unpassenden Regeln.',
  },
  keepWithin: {
    what: 'Sitzhöhe belassen.',
    why: 'Kniebeugung {valueDeg}° {methodLabel} liegt im freigegebenen Zielband {lowBound}–{highBound}° (Ziel {targetDeg}°, n={cycles}).',
    how: 'Aktuelle Position als Basis sichern (gleiches Bild, gleiche Haltung). Später unter denselben Bedingungen erneut messen.',
  },
  keepUnavailable: {
    what: 'Keine Einstellhandlung verfügbar.',
    why: 'Es gibt keine freigegebene, zur Methode passende Handlung. Die Beobachtung bleibt ohne Sattelrichtung.',
    how: 'Ergebnis speichern. Nicht aus einem vorläufigen Profil eine Richtung ableiten.',
  },
  adjustHigher: {
    what: 'Sattel etwas höher setzen — nur Richtung, keine Millimeter.',
    why: 'Kniebeugung {valueDeg}° {methodLabel} liegt über dem freigegebenen Zielband {lowBound}–{highBound}° (Ziel {targetDeg}°, n={cycles}).',
    how: 'Vorher-Stand sichern. Kleine Änderung in eine Richtung, dann unter gleichen Bedingungen erneut messen und vergleichen.',
  },
  adjustLower: {
    what: 'Sattel etwas tiefer setzen — nur Richtung, keine Millimeter.',
    why: 'Kniebeugung {valueDeg}° {methodLabel} liegt unter dem freigegebenen Zielband {lowBound}–{highBound}° (Ziel {targetDeg}°, n={cycles}).',
    how: 'Vorher-Stand sichern. Kleine Änderung in eine Richtung, dann unter gleichen Bedingungen erneut messen und vergleichen.',
  },
} as const satisfies Record<string, ActionTemplate>
