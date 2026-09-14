import { RESULT_EXPORT_KIND } from '../types/result.ts'
import { emptyMetricsReport } from '../metrics/pipeline.ts'
import { shippedProductionProfiles } from '../rules/catalog.ts'
import { getRuleProfile } from '../rules/catalog.ts'
import { decideRule } from '../rules/decide.ts'
import { createMemoryBackend } from '../sessions/storage.ts'
import { flowFeedback } from './feedback.ts'
import { SOLL_GHOST_LABEL } from './sollLabel.ts'
import { loadAdapters } from './adapters.ts'
import { overlayFilterFromSearch, poseForMetrics } from '../pose/overlayFilter.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { ampelAllowed, LAB_PROFILE, PRODUCTION_PROFILE } from './profile.ts'
import { qualityFromReport, realMetrics } from './bindMetrics.ts'
import { measurementFromKnee, decideActionFromFlow } from './bindRules.ts'
import { runActionHarness } from '../action/harness.ts'
import { beginnerSeatAction } from '../action/decide.ts'
import { buildMeasurementResult, consumeFrozenReport, savedFromResult, storageWriteMessage } from './buildResult.ts'
import { restoreOpenSaved, snapshotForExport, snapshotForResave } from './resultSnapshot.ts'
import { buildResultExport, resultToJson, resultToMarkdown } from './exportResult.ts'
import { alignSessionStores, fromMeasurement, toMeasurement } from './sessionAlign.ts'
import { parseMeasurementResult } from '../sessions/parseResult.ts'
import { comparePhaseResults } from '../sessions/compare.ts'
import { stripPhaseImages } from '../metrics/phaseFrames.ts'
import { insetCrop, isIdentityTransform, sourceTransformForCapture } from '../file/frameTransform.ts'
import { emptyPlaneScale, filterLengthAdvice, productLengthAdviceAllowed } from '../scale/index.ts'
import { emptyFootDiagnostic } from '../foot/index.ts'
import { applyConfirmed, confirmGripOnCalibration, confirmProposal, emptyDetectSession, proposeFromFixture, rejectClassLabel } from '../calibration/propose.ts'
import { bodyChecks } from './bodyChecks.ts'
import { applyCameraZoom, cameraZoom } from '../camera/zoom.ts'
import type { FitSession } from '../shell/FitSession.tsx'
import {
  pedalTrackerValid,
  remeasureDestination,
  shouldAbortCaptureOnLeave,
  shouldAutoCommitResult,
  stillCanvasVisible,
} from './navPolicy.ts'
import { runAufnahmeHarness } from './aufnahmeHarness.ts'
import { runAp01Harness } from './ap01Harness.ts'
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
check('soll ghost label is current-setup estimate', SOLL_GHOST_LABEL === 'Aktuelles Setup', SOLL_GHOST_LABEL)
check(
  'feedback: camera opening',
  flowFeedback({
    step: 'camera',
    camera: {
      permission: 'prompting',
      source: 'camera',
      deviceId: null,
      devices: [],
      error: null,
      usingMicrophone: false,
    },
    personVisible: false,
    pedalStatus: 'idle',
    workerError: null,
  }).title === 'Kamera wird geöffnet',
  'opening',
)
check(
  'feedback: person erkannt',
  flowFeedback({
    step: 'camera',
    camera: {
      permission: 'granted',
      source: 'camera',
      deviceId: 'cam',
      devices: [],
      error: null,
      usingMicrophone: false,
    },
    personVisible: true,
    pedalStatus: 'locked',
    workerError: null,
  }).title === 'Person erkannt',
  'person',
)
check(
  'feedback: miss is not worker timeout',
  flowFeedback({
    step: 'camera',
    camera: {
      permission: 'granted',
      source: 'camera',
      deviceId: 'cam',
      devices: [],
      error: null,
      usingMicrophone: false,
    },
    personVisible: false,
    pedalStatus: 'idle',
    workerError: null,
  }).title === 'Keine Person erkannt',
  'miss',
)
check(
  'feedback: real timeout stays visible',
  flowFeedback({
    step: 'camera',
    camera: {
      permission: 'granted',
      source: 'camera',
      deviceId: 'cam',
      devices: [],
      error: null,
      usingMicrophone: false,
    },
    personVisible: false,
    pedalStatus: 'idle',
    workerError: 'Pose-Erkennung antwortet nicht (Timeout). Erneut versuchen.',
  }).id === 'pose-error',
  'timeout',
)
check(
  'feedback: pedalmarker auswählen',
  flowFeedback({
    step: 'body',
    camera: {
      permission: 'granted',
      source: 'camera',
      deviceId: 'cam',
      devices: [],
      error: null,
      usingMicrophone: false,
    },
    personVisible: true,
    pedalStatus: 'idle',
    workerError: null,
  }).title === 'Pedalmarker auswählen',
  'pedal',
)
check('metrics adapter is module', adapters.metrics.source === 'module', adapters.metrics.source)
check('rules adapter is module', adapters.rules.source === 'module', adapters.rules.source)
check('sessions adapter is module', adapters.sessions.source === 'module', adapters.sessions.source)
check('soll adapter is module', adapters.soll.source === 'module', adapters.soll.source)

check('no shipped production Ampel profiles', shippedProductionProfiles().length === 0, String(shippedProductionProfiles().length))
check('lab profile locks Ampel', ampelAllowed(LAB_PROFILE) === false, 'lab')
check(
  '1€ overlay URL is opt-in and never a metrics default',
  overlayFilterFromSearch('') === false && overlayFilterFromSearch('?overlayFilter=1') === true,
  'overlayFilter',
)
{
  const rawPose = syntheticPoseFrame(0)
  const decoy = { ...rawPose, timestampMs: 99 }
  check('metrics consume raw pose, not the overlay', poseForMetrics(rawPose, decoy) === rawPose, 'raw')
}
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
    recs[0]!.reason.includes('Keine farbige Bewertung') &&
    !/sattel etwas höher/i.test(blob),
  recs[0]?.title ?? 'missing',
)

const r2Cards = [
  card({
    id: 'knee_flexion',
    label: 'Kniebeugung',
    value: 50,
    method: 'bottom_dead_center',
    usableCycles: 12,
    band: 'out',
  }),
]
const r2Quality = quality({
  level: 'ok',
  label: 'Qualität ausreichend',
  validRevs: 12,
  trackingLevel: 'ok',
  requiredMetricsOk: true,
  usableCycles: { knee_flexion: 12 },
  measurementId: 'meas-r2',
})
const r2Action = decideActionFromFlow({
  cards: r2Cards,
  quality: r2Quality,
  productionEnabled: true,
  captureId: 'cap-r2',
  analysisId: 'an-r2',
  evidenceIds: ['phase:bdc'],
  lensStatus: 'validated',
})
const r2Recs = adapters.rules.recommend({
  cards: r2Cards,
  quality: r2Quality,
  productionEnabled: true,
  captureId: 'cap-r2',
  analysisId: 'an-r2',
  evidenceIds: ['phase:bdc'],
  lensStatus: 'validated',
})
const r2Blob = `${JSON.stringify(r2Action)} ${JSON.stringify(r2Recs)}`.toLowerCase()
check(
  'r2-provisional-bdc-50-no-beginner-seat-action',
  r2Action.kind === 'review' &&
    r2Action.released === false &&
    !beginnerSeatAction(r2Action) &&
    r2Action.parameter === null &&
    r2Action.direction === null &&
    r2Action.report.valueDeg === 50 &&
    r2Action.blockReasons.includes('url_flag_ignored') &&
    r2Action.blockReasons.includes('profile_provisional') &&
    !r2Blob.includes('sattel etwas höher'),
  `kind=${r2Action.kind} what=${r2Action.template.what}`,
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
    hiddenQuality.usableCycles?.knee_flexion === 0,
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
const TECH_UX = /bottom_dead_center|cycle_mean|\bWorker\b|\bAdapter\b/
check(
  'a1-ui-cards-copy-method-not-invent',
  cardsFromBdc[0]!.method === 'bottom_dead_center' &&
    cardsFromBdc[0]!.value === 31 &&
    cardsFromBdc[0]!.usableCycles === 12 &&
    !TECH_UX.test(cardsFromBdc[0]!.targetHint) &&
    !TECH_UX.test(cardsFromBdc[0]!.detail ?? ''),
  `${cardsFromBdc[0]!.method} ${cardsFromBdc[0]!.targetHint}`,
)
const productCopy = [
  ...cardsFromBdc.map((card) => `${card.targetHint} ${card.detail ?? ''} ${card.bandView?.decisionText ?? ''} ${card.bandView?.definition ?? ''}`),
  ...hiddenQuality.notes,
  ...qualityFromReport({
    cards: meanCards,
    validRevs: 12,
    targetRevs: 10,
    lostFrames: 0,
    report: meanOnlyReport,
  }).notes,
].join('\n')
check(
  'product hints stay German without lab method codes',
  !TECH_UX.test(productCopy) && /tiefsten Pedalpunkt/.test(productCopy),
  productCopy.slice(0, 160),
)
const kneeCard = cardsFromBdc[0]!
const trunkCard = cardsFromBdc.find((item) => item.id === 'torso_lean')
check(
  'e-cards-show-definition-phase-n-iqr',
  Boolean(kneeCard.bandView) &&
    /180/.test(kneeCard.bandView?.definition ?? '') &&
    kneeCard.bandView?.phase === 'am tiefsten Pedalpunkt' &&
    kneeCard.bandView?.sampleSize === 12 &&
    kneeCard.bandView?.spreadDeg === 1 &&
    /beobachtete Streuung/.test(kneeCard.bandView?.spreadNote ?? ''),
  `${kneeCard.bandView?.phase} n=${kneeCard.bandView?.sampleSize} iqr=${kneeCard.bandView?.spreadDeg}`,
)
check(
  'e-ok-metric-is-not-auto-green',
  kneeCard.band === 'in' &&
    kneeCard.bandView?.scoreable === true &&
    (trunkCard?.band ?? 'unknown') === 'unknown' &&
    trunkCard?.bandView?.scoreable === false,
  `knee=${kneeCard.band} trunk=${trunkCard?.band}`,
)
check(
  'e-empty-cards-not-green',
  emptyCards.every((item) => item.band === 'unknown' && item.bandView?.scoreable === false),
  emptyCards.map((item) => `${item.id}:${item.band}`).join(','),
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
  binding: {
    source: 'synthetic' as const,
    deviceId: null,
    width: 1280,
    height: 720,
    setupId: 'synthetic:default:1280x720',
  },
}

const dataset = buildMeasurementResult({
  startedAt: '2026-09-11T10:00:00.000Z',
  endedAt: '2026-09-11T10:01:00.000Z',
  capture: 'synthetic',
  evaluation: 'demo',
  profile: LAB_PROFILE,
  calibration: calA,
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
  quality: quality({
    level: 'ok',
    label: 'Qualität ausreichend',
    validRevs: 12,
    trackingLevel: 'ok',
    requiredMetricsOk: true,
    usableCycles: { knee_flexion: 12 },
    measurementId: 'meas-export',
  }),
  recommendations: recs,
  actionDecision: decideActionFromFlow({
    cards: bdcCards,
    quality: quality({
      level: 'ok',
      label: 'Qualität ausreichend',
      validRevs: 12,
      trackingLevel: 'ok',
      requiredMetricsOk: true,
      usableCycles: { knee_flexion: 12 },
      measurementId: 'meas-export',
    }),
    productionEnabled: false,
    captureId: 'meas-export',
    analysisId: 'meas-export',
  }),
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
  source: string
  localOnly: boolean
  upload: boolean
  evaluation: string
  productRelease: string
  result: {
    id: string
    source: string
    validRevs: number
    quality: QualityReport
    metrics: MetricCardModel[]
    method: { metrics: string; rules: string }
    profile: { id: string }
    time: { startedAt: string; endedAt: string }
    calibration: {
      version: number
      marks: { B: { x: number } | null }
      binding?: { source: string; setupId: string }
    }
  }
}
check(
  'JSON export is local-only and has no millimetre advice',
  parsed.localOnly === true &&
    parsed.upload === false &&
    parsed.kind === RESULT_EXPORT_KIND &&
    parsed.result.quality.measurementId === 'meas-export' &&
    parsed.result.validRevs === 12 &&
    parsed.result.metrics[0]!.usableCycles === 12 &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(json),
  'json',
)
check(
  'Markdown export includes recommendation and Ampel lock',
  md.includes('# BikeFit Messung') &&
    (md.includes('Keine produktive Ampel') || md.includes('Keine farbige Bewertung')) &&
    md.includes('Handlung (ActionDecision)') &&
    md.includes('Kniebeugung') &&
    md.includes('meas-export') &&
    !/\d+(?:[.,]\d+)?\s*mm\b/i.test(md) &&
    !/sattel etwas höher/i.test(md),
  'md',
)
const exportedAction = parseMeasurementResult(parsed.result)
check(
  'exported actionDecision is beginner-safe',
  exportedAction.ok &&
    exportedAction.value.actionDecision?.kind === 'review' &&
    exportedAction.value.actionDecision.parameter === null &&
    exportedAction.value.actionDecision.direction === null,
  exportedAction.ok
    ? exportedAction.value.actionDecision?.kind ?? 'missing'
    : exportedAction.reason,
)
check(
  'a2-export-revs-and-n-match',
  parsed.result.validRevs === parsed.result.quality.validRevs &&
    parsed.result.metrics[0]!.usableCycles === parsed.result.quality.usableCycles?.knee_flexion &&
    parsed.result.quality.measurementId === 'meas-export',
  `revs=${parsed.result.validRevs} n=${parsed.result.metrics[0]!.usableCycles} id=${parsed.result.quality.measurementId}`,
)
check(
  'demo is identifiable in JSON and Markdown without browser context',
  parsed.demo === true &&
    parsed.source === 'demo' &&
    parsed.result.source === 'demo' &&
    parsed.evaluation === 'demo' &&
    parsed.productRelease === 'p0' &&
    json.includes('"source": "demo"') &&
    json.includes('"evaluation": "demo"') &&
    md.includes('**Demo-Auswertung**') &&
    md.includes('| Quelle | demo |') &&
    md.includes('| demo | ja |'),
  `demo=${String(parsed.demo)} source=${parsed.result.source}`,
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

const persisted = toMeasurement(resaved)
check('session persist keeps frozen source and calibration binding', Boolean(
  persisted?.result?.source === 'demo' &&
    persisted.result.calibration.binding?.setupId === 'synthetic:default:1280x720' &&
    persisted.result.calibration.binding?.source === 'synthetic',
), persisted?.result?.source ?? 'none')

const storeA = createMemoryBackend()
if (persisted) await storeA.put(persisted)
const listedA = await storeA.list()
const openedA = listedA[0] ? fromMeasurement(listedA[0]) : null
const restoredA = openedA ? restoreOpenSaved(openedA) : null
const exportAfterOpen = restoredA ? snapshotForExport(restoredA.result, '2026-09-11T13:00:00.000Z') : null
const resaveAfterOpen = restoredA
  ? snapshotForResave(restoredA.result, { title: 'Resave A', updatedAt: '2026-09-11T13:00:00.000Z' })
  : null
liveCalB.version = 100
liveCalB.marks = { B: { x: 1, y: 1 }, S: { x: 2, y: 2 }, G: { x: 3, y: 3 } }
check(
  'openSaved A with live setup B keeps A on export/resave',
  Boolean(
    restoredA &&
      exportAfterOpen &&
      resaveAfterOpen &&
      restoredA.journey === 'demo' &&
      restoredA.result.source === 'demo' &&
      restoredA.result.provenance.capture === 'synthetic' &&
      restoredA.result.quality.measurementId === 'meas-export' &&
      restoredA.result.time.startedAt === '2026-09-11T10:00:00.000Z' &&
      restoredA.result.method.metrics.includes('E4') &&
      restoredA.result.profile.id === LAB_PROFILE.id &&
      restoredA.result.calibration.version === 1 &&
      restoredA.result.calibration.marks.B?.x === 10 &&
      restoredA.result.calibration.binding?.setupId === 'synthetic:default:1280x720' &&
      restoredA.result.metrics[0]?.value === 48 &&
      exportAfterOpen.result.calibration.marks.B?.x === 10 &&
      exportAfterOpen.result.source === 'demo' &&
      exportAfterOpen.source === 'demo' &&
      resaveAfterOpen.result.calibration.marks.B?.x === 10 &&
      resaveAfterOpen.result.source === 'demo' &&
      liveCalB.version === 100,
  ),
  `open source=${restoredA?.result.source ?? 'none'} cal=${restoredA?.result.calibration.marks.B?.x ?? '—'} liveB=${liveCalB.version}`,
)

const { source: _dropSource, ...legacyWithoutSource } = dataset
const legacyParsed = parseMeasurementResult(legacyWithoutSource)
check(
  'legacy results without source derive it from provenance',
  legacyParsed.ok && legacyParsed.value.source === 'demo',
  legacyParsed.ok ? legacyParsed.value.source : legacyParsed.reason,
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

check(
  'back/leave aborts countdown and recording only',
  shouldAbortCaptureOnLeave('countdown') &&
    shouldAbortCaptureOnLeave('recording') &&
    !shouldAbortCaptureOnLeave('ready') &&
    !shouldAbortCaptureOnLeave('finished') &&
    !shouldAbortCaptureOnLeave('aborted'),
  'countdown+recording',
)
check(
  'aborted attempt never auto-commits a result',
  shouldAutoCommitResult({
    phase: 'finished',
    captureId: 'take-1',
    committedId: null,
    ignoredIds: new Set(['take-1']),
  }) === false &&
    shouldAutoCommitResult({
      phase: 'finished',
      captureId: 'take-2',
      committedId: null,
      ignoredIds: new Set(['take-1']),
    }) === true &&
    shouldAutoCommitResult({
      phase: 'aborted',
      captureId: 'take-3',
      committedId: null,
      ignoredIds: [],
    }) === false,
  'ignore-id + aborted phase',
)

const lockedManual = { status: 'locked' as const, pixel: { x: 40, y: 80 } }
const lostManual = { status: 'lost' as const, pixel: null }
check(
  'remeasure keeps measure when setup and non-magenta lock are valid',
  remeasureDestination({
    cameraReady: true,
    calibrateReady: true,
    sample: lockedManual,
    seedPoint: { x: 40, y: 80 },
  }) === 'measure' && pedalTrackerValid(lockedManual, { x: 40, y: 80 }),
  'keep-lock',
)
check(
  'remeasure returns to body when marker is lost',
  remeasureDestination({
    cameraReady: true,
    calibrateReady: true,
    sample: lostManual,
    seedPoint: { x: 40, y: 80 },
  }) === 'body' && !pedalTrackerValid(lostManual, { x: 40, y: 80 }),
  'reselect',
)
check(
  'remeasure returns to body when setup is invalid',
  remeasureDestination({
    cameraReady: true,
    calibrateReady: false,
    sample: lockedManual,
    seedPoint: { x: 40, y: 80 },
  }) === 'body',
  'setup',
)

check(
  'freeze canvas only on calib in flow; hidden on body',
  stillCanvasVisible({ frozen: true, step: 'calibrate', mode: 'flow' }) &&
    !stillCanvasVisible({ frozen: true, step: 'body', mode: 'flow' }) &&
    !stillCanvasVisible({ frozen: true, step: 'measure', mode: 'flow' }) &&
    stillCanvasVisible({ frozen: true, step: 'body', mode: 'lab' }) &&
    !stillCanvasVisible({ frozen: false, step: 'calibrate', mode: 'flow' }),
  'calib-only',
)

check(
  'bicycle class label is not B/S/G success',
  rejectClassLabel('bicycle').candidates.length === 0 && rejectClassLabel('bicycle').phase === 'failed',
  'class-label rejected',
)

const autoSession = confirmProposal(proposeFromFixture())
const autoApplied = applyConfirmed(autoSession, {
  source: 'synthetic',
  deviceId: null,
  width: 1280,
  height: 720,
  setupId: 'synthetic:default:1280x720',
})
check(
  'propose→confirm applies BikeCalibration with detect origin',
  autoSession.phase === 'applied' &&
    autoApplied.calibration?.detect?.version.detector === 'geometry.v1' &&
    autoApplied.calibration.provenance?.S?.origin === 'auto' &&
    autoApplied.calibration.provenance?.S?.status === 'confirmed' &&
    autoApplied.calibration.marks.B != null,
  autoApplied.reason,
)

const autoDataset = buildMeasurementResult({
  startedAt: '2026-09-11T10:00:00.000Z',
  endedAt: '2026-09-11T10:01:00.000Z',
  capture: 'synthetic',
  evaluation: 'standard',
  profile: LAB_PROFILE,
  calibration: autoApplied.calibration ?? calA,
  metrics: dataset.metrics,
  quality: dataset.quality,
  recommendations: recs,
  validRevs: 12,
  targetRevs: 10,
  adapters: dataset.adapters,
})
const parsedAuto = parseMeasurementResult(JSON.parse(JSON.stringify(autoDataset)))
check(
  'result snapshot keeps detect version and per-point origin',
  parsedAuto.ok &&
    parsedAuto.value.calibration.detect?.version.detector === 'geometry.v1' &&
    parsedAuto.value.calibration.provenance?.B?.origin === 'auto',
  parsedAuto.ok ? parsedAuto.value.calibration.detect?.version.detector ?? 'none' : parsedAuto.reason,
)

const fileDataset = buildMeasurementResult({
  startedAt: '2026-09-11T12:00:00.000Z',
  endedAt: '2026-09-11T12:00:08.000Z',
  capture: 'file',
  evaluation: 'standard',
  profile: LAB_PROFILE,
  calibration: dataset.calibration,
  metrics: dataset.metrics,
  quality: dataset.quality,
  recommendations: recs,
  validRevs: 8,
  targetRevs: 10,
  adapters: dataset.adapters,
  file: {
    kind: 'video',
    name: 'ride.mp4',
    mimeType: 'video/mp4',
    width: 1280,
    height: 720,
    durationMs: 8000,
    mediaTimeRangeMs: { start: 0, end: 8000 },
    staticCheck: false,
    rotationDeg: 0,
    crop: null,
    upload: false,
  },
  mediaStartMs: 0,
  mediaEndMs: 8000,
})
const parsedFile = parseMeasurementResult(JSON.parse(JSON.stringify(fileDataset)))
check(
  'file capture freezes source, dimensions, and media range',
  parsedFile.ok &&
    parsedFile.value.source === 'file' &&
    parsedFile.value.file?.width === 1280 &&
    parsedFile.value.file.height === 720 &&
    parsedFile.value.file.upload === false &&
    parsedFile.value.time.mediaEndMs === 8000,
  parsedFile.ok ? parsedFile.value.source : parsedFile.reason,
)
check('file capture does not enable Ampel', ampelAllowed(fileDataset.profile) === false, 'lab')

const restoredIdle = emptyDetectSession()
const restoredCal = autoApplied.calibration
const gripOnIdle = restoredCal
  ? bodyChecks({
      pose: { ready: false, frame: null, freshness: { status: 'idle' } },
      pedal: { sample: { status: 'idle', pixel: null, crankAngleDeg: null } },
      calibration: { detect: restoredIdle, data: restoredCal },
    } as unknown as FitSession)
  : []
const gripCheck = gripOnIdle.find((c) => c.id === 'grip')
const afterConfirmCal = restoredCal ? confirmGripOnCalibration(restoredCal, 'hand') : null
const gripAfter = afterConfirmCal
  ? bodyChecks({
      pose: { ready: false, frame: null, freshness: { status: 'idle' } },
      pedal: { sample: { status: 'idle', pixel: null, crankAngleDeg: null } },
      calibration: { detect: restoredIdle, data: afterConfirmCal },
    } as unknown as FitSession).find((c) => c.id === 'grip')
  : null
check(
  'body grip check stays pending after idle restore until explicit confirm',
  Boolean(restoredCal?.detect?.gripContact) &&
    restoredCal?.detect?.gripContact !== 'hand' &&
    gripCheck?.ok === false &&
    /Griffkontakt bestätigen/i.test(gripCheck?.hint ?? '') &&
    gripAfter?.ok === true,
  `stored=${restoredCal?.detect?.gripContact ?? 'none'} ok=${String(gripCheck?.ok)} after=${String(gripAfter?.ok)}`,
)

const incompleteLeg = syntheticPoseFrame(0)
incompleteLeg.landmarks[28]!.visibility = 0.05
const legCheck = bodyChecks({
  pose: { ready: true, frame: incompleteLeg, freshness: { status: 'live' } },
  pedal: { sample: { status: 'idle', pixel: null, crankAngleDeg: null } },
  calibration: { detect: restoredIdle, data: afterConfirmCal ?? restoredCal },
} as unknown as FitSession).find((c) => c.id === 'joints')
check(
  'body readiness requires ankle for knee measurement',
  legCheck?.ok === false && /Knöchel/.test(legCheck.hint),
  `ok=${String(legCheck?.ok)} hint=${legCheck?.hint ?? '—'}`,
)

let appliedZoom = 1
const zoomTrack = {
  getCapabilities: () => ({ zoom: { min: 0.5, max: 2, step: 0.1 } }),
  getSettings: () => ({ zoom: appliedZoom }),
  applyConstraints: async (constraints: { advanced: Array<{ zoom: number }> }) => {
    appliedZoom = constraints.advanced[0]!.zoom
  },
} as unknown as MediaStreamTrack
const zoomBefore = cameraZoom(zoomTrack)
const zoomAfter = await applyCameraZoom(zoomTrack, 0.5)
check(
  'camera zoom offers real 0.5x only when the video track reports it',
  zoomBefore?.min === 0.5 && zoomAfter === 0.5 && cameraZoom(zoomTrack)?.current === 0.5 &&
    cameraZoom({ getCapabilities: () => ({}) } as MediaStreamTrack) === null,
  `range=${zoomBefore?.min ?? '—'}–${zoomBefore?.max ?? '—'} applied=${zoomAfter}`,
)

const phaseDataset = buildMeasurementResult({
  startedAt: dataset.time.startedAt,
  endedAt: dataset.time.endedAt,
  capture: 'synthetic',
  evaluation: 'demo',
  profile: LAB_PROFILE,
  calibration: {
    version: 1,
    marks: { B: { x: 10, y: 20 }, S: { x: 12, y: 8 }, G: { x: 30, y: 10 } },
    transform: null,
    createdAt: '2026-09-11T00:00:00.000Z',
    updatedAt: '2026-09-11T00:00:00.000Z',
    binding: calA.binding,
  },
  metrics: dataset.metrics,
  quality: dataset.quality,
  recommendations: recs,
  validRevs: 12,
  targetRevs: 10,
  adapters: dataset.adapters,
  phaseEvidence: {
    schemaVersion: 1,
    stored: true,
    selectionMethod: 'crank_angle',
    metricMethod: 'bottom_dead_center',
    windowHalfDeg: 12,
    side: 'right',
    source: 'demo',
    representativeCycle: { index: 2, startIndex: 20, endIndex: 50, startMs: 800, endMs: 1600 },
    calibrationVersion: 1,
    setupId: 'synthetic:default:1280x720',
    capturedAt: '2026-09-11T10:01:00.000Z',
    slots: [
      {
        id: 'tdc',
        targetDeg: 0,
        status: 'captured',
        frame: {
          frameIndex: 21,
          timestampMs: 820,
          capturedAt: '2026-09-11T10:01:00.000Z',
          crankAngleDeg: 1.2,
          phase01: 0.003,
          cycleIndex: 2,
          nearSide: 'right',
          marks: { B: { x: 10, y: 20 }, S: { x: 12, y: 8 }, G: { x: 30, y: 10 } },
          pose: null,
          frameMetrics: { kneeFlexionDeg: 44, trunkTorsoDeg: null, elbowDeg: null },
          image: { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,PHASE' },
        },
      },
      { id: 'forward', targetDeg: 90, status: 'missing', frame: null },
      { id: 'bdc', targetDeg: 180, status: 'captured', frame: {
        frameIndex: 36,
        timestampMs: 1200,
        capturedAt: '2026-09-11T10:01:00.000Z',
        crankAngleDeg: 180.4,
        phase01: 0.501,
        cycleIndex: 2,
        nearSide: 'right',
        marks: { B: { x: 10, y: 20 }, S: { x: 12, y: 8 }, G: { x: 30, y: 10 } },
        pose: null,
        frameMetrics: { kneeFlexionDeg: 38, trunkTorsoDeg: null, elbowDeg: null },
        image: { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,BDC' },
      } },
      { id: 'back', targetDeg: 270, status: 'missing', frame: null },
    ],
  },
})
const liveMarks = { B: { x: 0, y: 0 }, S: { x: 0, y: 0 }, G: { x: 0, y: 0 } }
const parsedPhase = parseMeasurementResult(JSON.parse(JSON.stringify(phaseDataset)))
const strippedPhase = phaseDataset.phaseEvidence ? stripPhaseImages(phaseDataset.phaseEvidence) : null
const mdPhase = resultToMarkdown(buildResultExport(phaseDataset, '2026-09-11T00:00:00.000Z'))
check(
  'frozen phase stills survive parse and ignore live calib marks',
  parsedPhase.ok &&
    parsedPhase.value.phaseEvidence?.slots[0]?.frame?.image?.dataUrl === 'data:image/jpeg;base64,PHASE' &&
    parsedPhase.value.phaseEvidence?.slots[0]?.frame?.marks.B?.x === 10 &&
    liveMarks.B.x === 0 &&
    parsedPhase.value.phaseEvidence?.slots[1]?.status === 'missing',
  parsedPhase.ok ? 'ok' : parsedPhase.reason,
)
check(
  'markdown distinguishes Einzelbild vs missing phase; print is first-class',
  mdPhase.includes('Phasenmethode') &&
    mdPhase.includes('tdc: 1.2° (Einzelbild)') &&
    mdPhase.includes('forward: fehlt') &&
    mdPhase.includes('crank_angle'),
  'md phase',
)
check(
  'deleting stills does not invent a substitute frame',
  Boolean(
    strippedPhase &&
      strippedPhase.stored === false &&
      strippedPhase.slots[0]?.status === 'deleted' &&
      strippedPhase.slots[0]?.frame?.frameIndex === 21 &&
      strippedPhase.slots[0]?.frame?.image === null &&
      strippedPhase.slots[1]?.status === 'missing',
  ),
  strippedPhase?.slots.map((s) => s.status).join(',') ?? 'none',
)
const phaseCmp = comparePhaseResults(phaseDataset, phaseDataset)
check('compatible before/after when source/side/method/calib match', phaseCmp.compatible, phaseCmp.reasons.join(','))

const filePlusPhase = parseMeasurementResult(
  JSON.parse(
    JSON.stringify({
      ...fileDataset,
      phaseEvidence: phaseDataset.phaseEvidence
        ? { ...phaseDataset.phaseEvidence, source: 'file' }
        : null,
    }),
  ),
)
check(
  'file provenance and phase stills coexist on one result',
  filePlusPhase.ok &&
    filePlusPhase.value.source === 'file' &&
    filePlusPhase.value.file?.upload === false &&
    filePlusPhase.value.phaseEvidence?.source === 'file' &&
    filePlusPhase.value.phaseEvidence.slots[0]?.status === 'captured',
  filePlusPhase.ok ? 'file+phase' : filePlusPhase.reason,
)

const leftoverCrop = { rotation: 90 as const, crop: insetCrop(0.1) }
check(
  'file crop/rotation does not leak to camera or synthetic',
  sourceTransformForCapture('file', leftoverCrop) === leftoverCrop &&
    isIdentityTransform(sourceTransformForCapture('camera', leftoverCrop)) &&
    isIdentityTransform(sourceTransformForCapture('synthetic', leftoverCrop)),
  'isolation',
)

const scaleFrozen = buildMeasurementResult({
  startedAt: dataset.time.startedAt,
  endedAt: dataset.time.endedAt,
  capture: 'synthetic',
  evaluation: 'demo',
  profile: LAB_PROFILE,
  calibration: {
    ...dataset.calibration,
    transform: dataset.calibration.transform
      ? { ...dataset.calibration.transform, pixelsPerMm: null }
      : null,
  },
  metrics: dataset.metrics,
  quality: dataset.quality,
  recommendations: dataset.recommendations,
  validRevs: dataset.validRevs,
  targetRevs: dataset.targetRevs,
  adapters: dataset.adapters,
  scale: emptyPlaneScale(),
  foot: emptyFootDiagnostic(),
})
const parsedScaleFoot = parseMeasurementResult(JSON.parse(JSON.stringify(scaleFrozen)))
check(
  'result can freeze absent scale + foot diagnosis without length advice',
  parsedScaleFoot.ok &&
    parsedScaleFoot.value.scale?.status === 'absent' &&
    parsedScaleFoot.value.scale.defaultWheelDiameter === false &&
    parsedScaleFoot.value.foot?.metricCards.length === 0 &&
    parsedScaleFoot.value.foot?.recommendations.length === 0 &&
    productLengthAdviceAllowed(parsedScaleFoot.value.scale) === false,
  parsedScaleFoot.ok ? parsedScaleFoot.value.scale?.status ?? 'ok' : parsedScaleFoot.reason,
)
const blockedRecs = filterLengthAdvice(
  [{ priority: 1, title: 'Sattel 8 mm senken', reason: '12 mm zu hoch' }],
  scaleFrozen.scale,
)
check(
  'flow length recs stay off without confirmed scale; Ampel still lab-locked',
  blockedRecs[0]?.title === 'Keine Längenempfehlung' && !ampelAllowed(LAB_PROFILE),
  blockedRecs[0]?.reason ?? 'none',
)

const aufnahme = runAufnahmeHarness()
for (const item of aufnahme.cases) {
  cases.push({ name: item.name, passed: item.passed, detail: item.detail })
}

const ap01 = await runAp01Harness()
for (const item of ap01.cases) {
  cases.push({ name: item.name, passed: item.passed, detail: item.detail })
}

const actionHarness = runActionHarness()
for (const item of actionHarness.cases) {
  cases.push({ name: `action:${item.name}`, passed: item.passed, detail: item.detail })
}

const failed = cases.filter((c) => !c.passed)
for (const item of cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (failed.length > 0) {
  throw new Error(`FLOW_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`)
}
console.log(`FLOW_HARNESS_OK — ${cases.length} checks. Adapters module, Ampel locked, P1+immutable result + scale/foot freeze + Aufnahme 4–6 + AP-01 + AP-10 ActionDecision.`)
