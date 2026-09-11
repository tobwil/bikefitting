import type { RulesApi } from '../contracts.ts'
import type { Recommendation } from '../types.ts'

export const stubRules: RulesApi = {
  source: 'stub',
  recommend({ cards, quality, productionEnabled }) {
    const recs: Recommendation[] = []
    const knee = cards.find((c) => c.id === 'knee_flexion')
    const hip = cards.find((c) => c.id === 'hip_angle')
    const torso = cards.find((c) => c.id === 'torso_lean')

    if (knee?.value != null && knee.band === 'out' && knee.value < 35) {
      recs.push({
        priority: 1,
        title: 'Sattel leicht senken',
        reason: 'Kniebeugung unter dem Zielband — typisch zu hoher Sattel.',
        metricId: 'knee_flexion',
        deltaHint: '2–6 mm',
      })
    } else if (knee?.value != null && knee.band === 'out' && knee.value > 45) {
      recs.push({
        priority: 1,
        title: 'Sattel 4–8 mm anheben',
        reason: 'Kniebeugung über dem Zielband — Bein zu stark gebeugt am unteren Totpunkt.',
        metricId: 'knee_flexion',
        deltaHint: '4–8 mm',
      })
    } else if (knee?.band === 'near') {
      recs.push({
        priority: 2,
        title: 'Sattelhöhe feinjustieren',
        reason: 'Kniebeugung am Rand des Zielbands.',
        metricId: 'knee_flexion',
        deltaHint: '2–4 mm',
      })
    }

    if (hip?.value != null && hip.band === 'out') {
      recs.push({
        priority: recs.length ? 2 : 1,
        title: 'Sattelposition längs prüfen',
        reason: 'Hüftwinkel außerhalb des Arbeitsbands — Vor-/Zurückschieben vor Stem-Wechsel.',
        metricId: 'hip_angle',
      })
    }

    if (torso?.value != null && torso.band === 'out') {
      recs.push({
        priority: recs.length ? 3 : 1,
        title: 'Reichweite / Vorbau prüfen',
        reason: 'Rumpfneigung weicht vom Hoods-Zielband ab.',
        metricId: 'torso_lean',
      })
    }

    if (quality.level !== 'ok') {
      recs.push({
        priority: 9,
        title: 'Messung wiederholen',
        reason: quality.notes[0] ?? 'Qualität reicht für eine belastbare Empfehlung nicht.',
      })
    }

    if (recs.length === 0) {
      recs.push({
        priority: 1,
        title: 'Keine vorrangige Korrektur',
        reason: 'Die drei Leitmetriken liegen im oder nahe am Zielband.',
      })
    }

    if (!productionEnabled) {
      return recs
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 3)
        .map((r) => ({
          ...r,
          reason: `${r.reason} (Regel-STUB — nicht productionEnabled.)`,
        }))
    }

    return recs.sort((a, b) => a.priority - b.priority).slice(0, 3)
  },
}
