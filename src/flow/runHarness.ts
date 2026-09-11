import { loadAdapters } from './adapters.ts'
import { ampelAllowed, LAB_PROFILE, PRODUCTION_PROFILE } from './profile.ts'
import { shippedProductionProfiles } from '../rules/catalog.ts'
import { getRuleProfile } from '../rules/catalog.ts'
import { decideRule } from '../rules/decide.ts'
import { qualityFromReport, realMetrics } from './bindMetrics.ts'
import { measurementFromKnee } from './bindRules.ts'
import { emptyMetricsReport } from '../metrics/pipeline.ts'
import { buildResultExport, resultToJson, resultToMarkdown } from './exportResult.ts'
import type { MetricResult, MetricsReport } from '../types/metrics.ts'
import type { MetricCardModel, QualityReport } from './types.ts'

const cases: Array<{ name: string; passed: boolean; detail: string }> = []

function check(name: string, passed: boolean, detail: string) {
  cases.push({ name, passed, detail })
}

function card(partial: Partial<MetricCardModel> & Pick<MetricCardModel, 'id' | 'label'>): MetricCardModel {
  return {
    value: null,
    unit: '°',
    method: null,
    usableCycles: 0,
    band: 'unknown',
    targetHint: '',
    ...partial,
  }
}

function quality(partial: Partial<QualityReport>): QualityReport {
  return {
    level: 'insufficient',
    label: 'Qualität unzureichend',
    validRevs: 0,
    targetRevs: 10,
    lostFrames: 0,
    notes: [],
    trackingLevel: 'insufficient',
    requiredMetricsOk: false,
    usableCycles: {},
    measurementId: null,
    ...partial,
  }
}

function metric(
  id: MetricResult['id'],
  method: MetricResult['method'],
  usable: number,
  value: number | null,
): MetricResult {
  if (value === null) {
    return {
      id,
      method,
      unit: 'deg',
      quality: 'unavailable',
      reasons: usable > 0 ? ['too_few_cycles'] : ['visibility'],
      degrees: null,
      usableCycles: usable,
    }
  }
  return {
    id,
    method,
    unit: 'deg',
    quality: 'ok',
    reasons: [],
    degrees: { mean: value, median: value, spread: 1, min: value, max: value, n: usable },
    usableCycles: usable,
  }
}

function reportOf(over: Partial<MetricsReport> & { kneeBdc?: MetricResult; kneeMean?: MetricResult }): MetricsReport {
  const base = emptyMetricsReport()
  return {
    ...base,
    ...over,
    metrics: {
      ...base.metrics,
      ...(over.metrics ?? {}),
      ...(over.kneeBdc ? { kneeFlexion: over.kneeBdc } : {}),
      ...(over.kneeMean ? { kneeFlexionCycleMean: over.kneeMean } : {}),
    },
  }
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
  emptyCards.length === 3 &&
    emptyCards.every((c) => c.value === null) &&
    emptyCards[0]!.method === 'bottom_dead_center' &&
    emptyCards[0]!.id === 'knee_flexion',
  emptyCards.map((c) => `${c.id}:${c.method}:${c.value}`).join(','),
)

const bdcCards = [
  card({
    id: 'knee_flexion',
    label: 'Kniebeugung',
    value: 48,
    method: 'bottom_dead_center',
    usableCycles: 12,
    band: 'out',
  }),
]
const recs = adapters.rules.recommend({
  cards: bdcCards,
  quality: quality({
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    trackingLevel: 'ok',
    requiredMetricsOk: true,
    usableCycles: { knee_flexion: 12 },
  }),
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

const hiddenKneeReport = reportOf({
  validRevolutions: 10,
  tracking: {
    quality: 'ok',
    validRevolutions: 10,
    candidateCycles: 10,
    lostFrames: 0,
    reasons: [],
  },
  kneeBdc: metric('kneeFlexion', 'bottom_dead_center', 0, null),
  kneeMean: metric('kneeFlexionCycleMean', 'cycle_mean', 0, null),
})
const hiddenCards = realMetrics.liveCards({
  pose: null,
  kneeDegrees: null,
  kneeVisible: false,
  pedal: {
    timestampMs: 0,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 10,
    status: 'locked',
    lostFrames: 0,
  },
  calibration: {
    version: 1,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
  },
  report: hiddenKneeReport,
})
const hiddenQuality = realMetrics.quality({
  cards: hiddenCards,
  validRevs: 10,
  targetRevs: 10,
  lostFrames: 0,
  productionEnabled: false,
  report: hiddenKneeReport,
  measurementId: 'meas-hidden',
})
check(
  'a6-ten-pedal-no-knee-not-quality-ok',
  hiddenQuality.level === 'insufficient' &&
    hiddenQuality.label !== 'Qualität ausreichend' &&
    hiddenQuality.trackingLevel === 'ok' &&
    hiddenQuality.requiredMetricsOk === false &&
    hiddenQuality.usableCycles.knee_flexion === 0,
  `${hiddenQuality.level} / ${hiddenQuality.label} tracking=${hiddenQuality.trackingLevel}`,
)

const threeKneeReport = reportOf({
  validRevolutions: 10,
  tracking: {
    quality: 'ok',
    validRevolutions: 10,
    candidateCycles: 10,
    lostFrames: 0,
    reasons: [],
  },
  kneeBdc: metric('kneeFlexion', 'bottom_dead_center', 3, 36),
  kneeMean: metric('kneeFlexionCycleMean', 'cycle_mean', 3, 50),
})
const threeCards = realMetrics.liveCards({
  pose: null,
  kneeDegrees: 36,
  kneeVisible: true,
  pedal: {
    timestampMs: 0,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 10,
    status: 'locked',
    lostFrames: 0,
  },
  calibration: {
    version: 1,
    marks: { B: null, S: null, G: null },
    transform: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
  },
  report: threeKneeReport,
})
const threeMeasure = measurementFromKnee({ cards: threeCards, report: threeKneeReport })
const profile = getRuleProfile('knee-flexion-bdc.v1')
const threeDecision = decideRule(profile, threeMeasure)
check(
  'a6-rules-use-knee-usable-cycles-not-pedal-revs',
  threeMeasure.cycles === 3 &&
    threeMeasure.method === 'bottom_dead_center' &&
    threeDecision.unavailableReason === 'insufficient_cycles' &&
    threeDecision.cycles === 3 &&
    threeDecision.minCycles === 10,
  `cycles=${threeMeasure.cycles} reason=${threeDecision.unavailableReason}`,
)

const meanOnlyReport = reportOf({
  validRevolutions: 12,
  tracking: {
    quality: 'ok',
    validRevolutions: 12,
    candidateCycles: 12,
    lostFrames: 0,
    reasons: [],
  },
  kneeBdc: metric('kneeFlexion', 'bottom_dead_center', 0, null),
  kneeMean: metric('kneeFlexionCycleMean', 'cycle_mean', 12, 58),
})
const meanCards = [
  card({
    id: 'knee_flexion',
    label: 'Kniebeugung',
    value: 58,
    method: 'cycle_mean',
    usableCycles: 12,
  }),
]
const meanMeasure = measurementFromKnee({ cards: meanCards, report: meanOnlyReport })
const meanDecision = decideRule(profile, meanMeasure)
const meanRecs = adapters.rules.recommend({
  cards: meanCards,
  quality: qualityFromReport({
    cards: meanCards,
    validRevs: 12,
    targetRevs: 10,
    lostFrames: 0,
    report: meanOnlyReport,
  }),
  productionEnabled: false,
  report: meanOnlyReport,
})
const meanBlob = JSON.stringify(meanRecs).toLowerCase()
check(
  'a1-cycle-mean-does-not-enter-bdc-profile',
  meanMeasure.method === 'bottom_dead_center' &&
    meanMeasure.valueDeg === null &&
    meanMeasure.valid === false &&
    meanMeasure.cycles === 0 &&
    meanDecision.state === 'unavailable' &&
    meanDecision.valueDeg === null &&
    !meanBlob.includes('58') &&
    meanRecs.some((item) => /erneut messen|keine sattel/i.test(`${item.title} ${item.reason}`)),
  `method=${meanMeasure.method} value=${meanMeasure.valueDeg} reason=${meanDecision.unavailableReason}`,
)

const cardMeanOnly = measurementFromKnee({
  cards: [
    card({
      id: 'knee_flexion',
      label: 'Kniebeugung',
      value: 58,
      method: 'cycle_mean',
      usableCycles: 12,
    }),
  ],
})
const cardMeanDecision = decideRule(profile, cardMeanOnly)
check(
  'a1-card-cycle-mean-is-method-mismatch',
  cardMeanOnly.method === 'cycle_mean' &&
    cardMeanOnly.valueDeg === null &&
    cardMeanDecision.unavailableReason === 'metric_mismatch',
  `method=${cardMeanOnly.method} reason=${cardMeanDecision.unavailableReason}`,
)

const bdcReport = reportOf({
  validRevolutions: 12,
  tracking: {
    quality: 'ok',
    validRevolutions: 12,
    candidateCycles: 12,
    lostFrames: 0,
    reasons: [],
  },
  kneeBdc: metric('kneeFlexion', 'bottom_dead_center', 12, 31),
  kneeMean: metric('kneeFlexionCycleMean', 'cycle_mean', 12, 58),
})
const bdcFromReport = measurementFromKnee({
  cards: realMetrics.liveCards({
    pose: null,
    kneeDegrees: 31,
    kneeVisible: true,
    pedal: {
      timestampMs: 0,
      pixel: null,
      crankAngleDeg: null,
      phase01: null,
      revolutions: 12,
      status: 'locked',
      lostFrames: 0,
    },
    calibration: {
      version: 1,
      marks: { B: null, S: null, G: null },
      transform: null,
      createdAt: '2026-09-11T00:00:00.000Z',
      updatedAt: '2026-09-11T00:00:00.000Z',
    },
    report: bdcReport,
  }),
  report: bdcReport,
})
check(
  'a1-only-bdc-value-goes-to-rules',
  bdcFromReport.method === 'bottom_dead_center' &&
    bdcFromReport.valueDeg === 31 &&
    bdcFromReport.cycles === 12 &&
    bdcFromReport.valid === true,
  `method=${bdcFromReport.method} value=${bdcFromReport.valueDeg} n=${bdcFromReport.cycles}`,
)

const cardsFromBdc = realMetrics.liveCards({
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
  report: bdcReport,
})
check(
  'a1-ui-cards-copy-method-not-invent',
  cardsFromBdc[0]!.method === 'bottom_dead_center' &&
    cardsFromBdc[0]!.value === 31 &&
    cardsFromBdc[0]!.usableCycles === 12 &&
    cardsFromBdc[0]!.targetHint.includes('bottom_dead_center'),
  `${cardsFromBdc[0]!.method} ${cardsFromBdc[0]!.targetHint}`,
)

const exportPayload = buildResultExport({
  profile: LAB_PROFILE,
  quality: quality({
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    trackingLevel: 'ok',
    requiredMetricsOk: true,
    usableCycles: { knee_flexion: 12 },
    measurementId: 'meas-export',
  }),
  metrics: [
    card({
      id: 'knee_flexion',
      label: 'Kniebeugung',
      value: 48,
      method: 'bottom_dead_center',
      usableCycles: 12,
      band: 'out',
    }),
  ],
  recommendations: recs,
  validRevs: 12,
  targetRevs: 10,
  measurementId: 'meas-export',
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
const parsed = exportPayload ? JSON.parse(json) : null
check(
  'JSON export is local-only and has no millimetre advice',
  Boolean(exportPayload) &&
    parsed.localOnly === true &&
    parsed.upload === false &&
    parsed.measurementId === 'meas-export' &&
    parsed.validRevs === 12 &&
    parsed.metrics[0].usableCycles === 12 &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(json),
  'json',
)
check(
  'Markdown export includes recommendation and Ampel lock',
  md.includes('# BikeFit Messung') &&
    md.includes('Keine produktive Ampel') &&
    md.includes('Kniebeugung') &&
    md.includes('meas-export') &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(md),
  'md',
)
check(
  'a2-export-revs-and-n-match',
  parsed.validRevs === parsed.quality.validRevs &&
    parsed.metrics[0].usableCycles === parsed.quality.usableCycles.knee_flexion &&
    parsed.measurementId === parsed.quality.measurementId,
  `revs=${parsed.validRevs} n=${parsed.metrics[0].usableCycles} id=${parsed.measurementId}`,
)

const failed = cases.filter((c) => !c.passed)
for (const item of cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (failed.length > 0) {
  throw new Error(`FLOW_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`)
}
console.log(`FLOW_HARNESS_OK — ${cases.length} checks. Adapters module, Ampel locked, P1 1/2/6.`)
