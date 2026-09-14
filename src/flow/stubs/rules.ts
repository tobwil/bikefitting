import type { RulesApi } from '../contracts.ts'
import type { Recommendation } from '../types.ts'

export const stubRules: RulesApi = {
  source: 'stub',
  recommend({ quality, productionEnabled }) {
    const recs: Recommendation[] = [
      {
        priority: 1,
        title: 'Keine Sitzeinstellung verfügbar',
        reason:
          'Regel-STUB. Keine Satteländerung aus einem unfreigegebenen Profil. Beobachtung prüfen oder erneut messen.',
      },
    ]
    if (quality.level !== 'ok') {
      recs.push({
        priority: 2,
        title: 'Messung wiederholen',
        reason: quality.notes[0] ?? 'Qualität reicht für eine belastbare Handlung nicht.',
      })
    }
    return recs.slice(0, 3).map((item) =>
      productionEnabled
        ? item
        : { ...item, reason: `${item.reason} (Regel-STUB — nicht productionEnabled.)` },
    )
  },
}
