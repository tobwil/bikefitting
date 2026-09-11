import { RESULT_EXPORT_KIND } from '../types/result.ts'
import { emptyMetricsReport } from '../metrics/pipeline.ts'
import { shippedProductionProfiles } from '../rules/catalog.ts'
import { createMemoryBackend } from '../sessions/storage.ts'
import { loadAdapters } from './adapters.ts'
import { realMetrics } from './bindMetrics.ts'
import { buildMeasurementResult, consumeFrozenReport, savedFromResult, storageWriteMessage } from './buildResult.ts'
import { buildResultExport, resultToJson, resultToMarkdown } from './exportResult.ts'
import { ampelAllowed, LAB_PROFILE, PRODUCTION_PROFILE } from './profile.ts'
import { alignSessionStores, toMeasurement } from './sessionAlign.ts'

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

const calA = {
  version: 1,
  marks: { B: { x: 10, y: 20 }, S: { x: 12, y: 8 }, G: { x: 30, y: 10 } },
  transform: {
    originPx: { x: 10, y: 20 },
    forwardPx: { x: 1, y: 0 },
    upPx: { x: 0, y: -1 },
    facing: 1 as const,
    pixelsPerMm: 2,
  },
  createdAt: '2026-09-11T00:00:00.000Z',
  updatedAt: '2026-09-11T00:00:00.000Z',
}

const dataset = buildMeasurementResult({
  startedAt: '2026-09-11T10:00:00.000Z',
  endedAt: '2026-09-11T10:01:00.000Z',
  capture: 'synthetic',
  evaluation: 'demo',
  profile: LAB_PROFILE,
  calibration: calA,
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
  quality: {
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    targetRevs: 10,
    lostFrames: 0,
    notes: [],
  },
  recommendations: recs,
  validRevs: 12,
  targetRevs: 10,
  adapters: {
    sessions: 'module',
    metrics: 'module',
    rules: 'module',
    soll: 'module',
  },
})

const liveCalB = {
  ...calA,
  version: 99,
  marks: { B: { x: 99, y: 99 }, S: { x: 88, y: 88 }, G: { x: 77, y: 77 } },
  updatedAt: '2026-09-11T12:00:00.000Z',
}
calA.version = 99
if (calA.marks.B) calA.marks.B.x = 1

const exportPayload = buildResultExport(dataset, '2026-09-11T00:00:00.000Z')
const json = resultToJson(exportPayload)
const md = resultToMarkdown(exportPayload)
const parsed = JSON.parse(json) as {
  kind: string
  demo: boolean
  localOnly: boolean
  upload: boolean
  evaluation: string
  productRelease: string
  result: { calibration: { version: number; marks: { B: { x: number } | null } } }
}
check(
  'JSON export is local-only and has no millimetre advice',
  parsed.localOnly === true &&
    parsed.upload === false &&
    parsed.kind === RESULT_EXPORT_KIND &&
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
check(
  'demo is identifiable in JSON and Markdown without browser context',
  parsed.demo === true &&
    parsed.evaluation === 'demo' &&
    parsed.productRelease === 'p0' &&
    json.includes('"evaluation": "demo"') &&
    md.includes('**Demo-Auswertung**') &&
    md.includes('| demo | ja |'),
  `demo=${String(parsed.demo)} eval=${parsed.evaluation}`,
)
check(
  'product release / quality / demo source stay separate fields',
  parsed.productRelease === 'p0' &&
    parsed.result.calibration.version === 1 &&
    dataset.quality.level === 'ok' &&
    dataset.provenance.evaluation === 'demo' &&
    dataset.provenance.capture === 'synthetic',
  'separated',
)
check(
  'export keeps frozen calibration A after live cal B exists',
  parsed.result.calibration.version === 1 &&
    parsed.result.calibration.marks.B?.x === 10 &&
    liveCalB.version === 99 &&
    dataset.calibration.version === 1 &&
    dataset.calibration.marks.B?.x === 10,
  `export v${parsed.result.calibration.version}`,
)

const resaved = savedFromResult(dataset, { title: 'Session A', updatedAt: '2026-09-11T12:00:00.000Z' })
check(
  'resave keeps calibration A from the dataset',
  resaved.result.calibration.version === 1 && resaved.result.calibration.marks.B?.x === 10,
  `resave v${resaved.result.calibration.version}`,
)

const frozen = consumeFrozenReport({
  report: emptyMetricsReport(),
  frozen: {
    ...emptyMetricsReport(),
    validRevolutions: 7,
    frames: 42,
  },
})
check('consumes PR1 frozen report when present', frozen.validRevolutions === 7 && frozen.frames === 42, `revs=${frozen.validRevolutions}`)

const freezeHost = {
  report: emptyMetricsReport(),
  frozen: null as ReturnType<typeof emptyMetricsReport> | null,
  freeze() {
    this.frozen = { ...emptyMetricsReport(), validRevolutions: 4, frames: 11 }
    return this.frozen
  },
}
const viaFreeze = consumeFrozenReport(freezeHost)
check('consumes freeze() return from PR1 host', viaFreeze.validRevolutions === 4, `revs=${viaFreeze.validRevolutions}`)

check(
  'quota write errors are shown as German storage copy',
  storageWriteMessage({ name: 'QuotaExceededError' }).includes('Speicher voll'),
  'quota',
)

const backend = createMemoryBackend()
const aligned = await alignSessionStores({
  sidecar: [resaved],
  backend,
  persistSidecar: false,
})
const stored = await backend.list()
check(
  'sidecar merges into session backend with full result',
  aligned.errors.length === 0 &&
    stored.length === 1 &&
    stored[0]?.result?.provenance.evaluation === 'demo' &&
    stored[0]?.result?.calibration.marks.B?.x === 10,
  `n=${stored.length} errors=${aligned.errors.length}`,
)
const mapped = toMeasurement(resaved)
check('session mapping keeps the immutable result', Boolean(mapped?.result && mapped.result.id === dataset.id), mapped?.id ?? 'none')

const failed = cases.filter((c) => !c.passed)
for (const item of cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (failed.length > 0) {
  throw new Error(`FLOW_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`)
}
console.log(`FLOW_HARNESS_OK — ${cases.length} checks. Adapters module, Ampel locked.`)
