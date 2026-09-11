import { loadAdapters } from './adapters.ts'
import { ampelAllowed, LAB_PROFILE, PRODUCTION_PROFILE } from './profile.ts'
import { shippedProductionProfiles } from '../rules/catalog.ts'
import { realMetrics } from './bindMetrics.ts'
import { emptyMetricsReport } from '../metrics/pipeline.ts'
import { buildResultExport, resultToJson, resultToMarkdown } from './exportResult.ts'

const cases: Array<{ name: string; passed: boolean; detail: string }> = []

function check(name: string, passed: boolean, detail: string) {
  cases.push({ name, passed, detail })
}

const adapters = await loadAdapters()
check('metrics adapter is module', adapters.metrics.source === 'module', adapters.metrics.source)
check('rules adapter is module', adapters.rules.source === 'module', adapters.rules.source)
check('sessions adapter is module', adapters.sessions.source === 'module', adapters.sessions.source)
check('soll adapter is module', adapters.soll.source === 'module', adapters.soll.source)

check('no shipped production Ampel profiles', shippedProductionProfiles().length === 0, String(shippedProductionProfiles().length))
check('lab profile locks Ampel', ampelAllowed(LAB_PROFILE) === false, 'lab')
check(
  'URL production profile still locked without approved rules',
  ampelAllowed(PRODUCTION_PROFILE) === false,
  'productionEnabled URL is not enough',
)

const emptyCards = realMetrics.liveCards({
  pose: null,
  kneeDegrees: null,
  kneeVisible: false,
  pedal: {
    timestampMs: 0,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status: 'idle',
    lostFrames: 0,
  },
  calibration: {
    version: 1,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
  },
  report: emptyMetricsReport(),
})
check(
  'empty metrics report yields unavailable cards',
  emptyCards.length === 3 && emptyCards.every((c) => c.value === null),
  emptyCards.map((c) => `${c.id}:${c.value}`).join(','),
)

const recs = adapters.rules.recommend({
  cards: [
    {
      id: 'knee_flexion',
      label: 'Kniebeugung',
      value: 48,
      unit: '°',
      band: 'out',
      targetHint: '',
    },
  ],
  quality: {
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    targetRevs: 10,
    lostFrames: 0,
    notes: [],
  },
  productionEnabled: false,
})
const blob = JSON.stringify(recs)
check(
  'recommendations follow §10.4 and never exact millimetres',
  recs.length >= 1 &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(blob) &&
    !/sattel\s+exakt/i.test(blob) &&
    recs[0]!.reason.includes('Keine produktive Ampel'),
  recs[0]?.title ?? 'missing',
)

const exportPayload = buildResultExport({
  profile: LAB_PROFILE,
  quality: {
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    targetRevs: 10,
    lostFrames: 0,
    notes: [],
  },
  metrics: [
    {
      id: 'knee_flexion',
      label: 'Kniebeugung',
      value: 48,
      unit: '°',
      band: 'out',
      targetHint: '',
    },
  ],
  recommendations: recs,
  validRevs: 12,
  targetRevs: 10,
  calibration: {
    version: 1,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
  },
  adapters: {
    sessions: 'module',
    metrics: 'module',
    rules: 'module',
    soll: 'module',
  },
  exportedAt: '2026-09-11T00:00:00.000Z',
})
const json = exportPayload ? resultToJson(exportPayload) : ''
const md = exportPayload ? resultToMarkdown(exportPayload) : ''
check(
  'JSON export is local-only and has no millimetre advice',
  Boolean(exportPayload) &&
    JSON.parse(json).localOnly === true &&
    JSON.parse(json).upload === false &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(json),
  'json',
)
check(
  'Markdown export includes recommendation and Ampel lock',
  md.includes('# BikeFit Messung') &&
    md.includes('Keine produktive Ampel') &&
    md.includes('Kniebeugung') &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(md),
  'md',
)

const failed = cases.filter((c) => !c.passed)
for (const item of cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (failed.length > 0) {
  throw new Error(`FLOW_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`)
}
console.log(`FLOW_HARNESS_OK — ${cases.length} checks. Adapters module, Ampel locked.`)
