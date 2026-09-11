import { POSE_HEAVY_ENABLED, POSE_HEAVY_REASON } from '../../config/models.ts'
import type {
  PoseCompareClipKind,
  PoseCompareDecision,
  PoseCompareDetectorKind,
  PoseCompareReport,
  PoseCompareVerdict,
} from '../../types/pose-compare.ts'
import type { AngleDeltaReport, LandmarkErrorReport, PoseModelRunStats } from '../../types/pose-compare.ts'

/** Live 30 fps budget for a later Full promotion. Not claimed on this VM. */
export const LIVE_FRAME_BUDGET_MS = 1000 / 30

const MIN_PAIRED_FOR_ACCURACY = 20
const MIN_RELATIVE_RMSE_GAIN = 0.15

export function decideCompare(input: {
  clipKind: PoseCompareClipKind
  annotated: boolean
  simulation?: boolean
  detector: PoseCompareDetectorKind
  lite: PoseModelRunStats
  full: PoseModelRunStats
  landmarkError: LandmarkErrorReport
  angleDeltas: AngleDeltaReport
}): PoseCompareDecision {
  const { lite, full, landmarkError, angleDeltas, clipKind, annotated, detector } = input
  const simulation = input.simulation === true || clipKind === 'synthetic'
  const lostShare = (run: PoseModelRunStats) => (run.frames === 0 ? 1 : run.lostFrames / run.frames)
  const bothMostlyLost = lostShare(lite) >= 0.8 && lostShare(full) >= 0.8
  const fullSlower = full.inference.n > 0 && lite.inference.n > 0 && full.inference.p95 > lite.inference.p95
  const fullOverBudget = full.inference.n > 0 && full.inference.p95 > LIVE_FRAME_BUDGET_MS
  const gt = landmarkError.vsTruth
  const hasGt = gt.available && gt.liteRmseNorm !== null && gt.fullRmseNorm !== null && gt.pairedFrames >= MIN_PAIRED_FOR_ACCURACY
  const rmseGain =
    hasGt && gt.liteRmseNorm && gt.liteRmseNorm > 0
      ? (gt.liteRmseNorm - (gt.fullRmseNorm ?? gt.liteRmseNorm)) / gt.liteRmseNorm
      : null
  const accuracyBetter = rmseGain !== null && rmseGain >= MIN_RELATIVE_RMSE_GAIN
  const runtimeOk = !fullOverBudget && full.inference.n > 0

  let verdict: PoseCompareVerdict = 'keep_lite'
  let reason: string
  if (bothMostlyLost && detector === 'mediapipe') {
    verdict = 'inconclusive'
    reason =
      'Beide Modelle verlieren fast alle Frames auf diesem Clip. Cartoon/Datei ohne Rider ist kein Bake-off. Lite bleibt Produkt-Default.'
  } else if (!hasGt) {
    verdict = 'inconclusive'
    reason =
      'Kein annotiertes Ground Truth. Pairwise Lite↔Full ist ein Unterschied, keine Genauigkeit. Lite bleibt Default, bis eine annotierte Seitenansicht vorliegt.'
  } else if (simulation || detector === 'injected') {
    verdict = 'keep_lite'
    reason = simulation
      ? 'Simulation (Fixture oder JSON ohne Bilddaten). Kein echter Ground-Truth-Modellvergleich. Lite bleibt Default.'
      : 'Harness-Track ist simuliert (Lite distal verrauscht). Das prüft die Vergleichsmath, nicht MediaPipe-Genauigkeit. Full wird nicht geladen, solange kein Mac-Clip Vorteil zeigt.'
  } else if (!accuracyBetter || !runtimeOk) {
    verdict = 'keep_lite'
    reason =
      'Full erfüllt die Promotionsregel nicht (Genauigkeit und Runtime). Lite bleibt Default; Full nur im Labor-Vergleich.'
  } else {
    verdict = 'full_eligible'
    reason =
      'Full wäre nach Genauigkeit+Runtime eligible — Promotion bleibt manuell. Produkt lädt Full nicht automatisch.'
  }

  const accuracyNote = hasGt
    ? `GT RMSE Lite ${gt.liteRmseNorm?.toFixed(4) ?? '—'} · Full ${gt.fullRmseNorm?.toFixed(4) ?? '—'} · Gain ${
        rmseGain === null ? '—' : `${(rmseGain * 100).toFixed(1)}%`
      } · Knie Δ ${fmtDeg(angleDeltas.kneeFlexion.meanAbsDeg)} · Ellbogen Δ ${fmtDeg(angleDeltas.elbowFlexion.meanAbsDeg)} · Rumpf Δ ${fmtDeg(angleDeltas.trunkTorso.meanAbsDeg)} · Paare ${gt.pairedFrames}`
    : `Kein GT. Pairwise Lite↔Full RMSE ${landmarkError.liteVsFull.rmseNorm.toFixed(4)} (${landmarkError.liteVsFull.rmsePx.toFixed(1)} px) auf ${landmarkError.liteVsFull.pairedFrames} Frames. Lost Lite ${lite.lostFrames}/${lite.frames} · Full ${full.lostFrames}/${full.frames}.`

  const runtimeNote = `Lite ${lite.versionPath} init ${lite.initMs.toFixed(0)} ms · infer p50 ${lite.inference.p50.toFixed(1)} / p95 ${lite.inference.p95.toFixed(1)} ms. Full ${full.versionPath} init ${full.initMs.toFixed(0)} ms · infer p50 ${full.inference.p50.toFixed(1)} / p95 ${full.inference.p95.toFixed(1)} ms. Budget 30 fps = ${LIVE_FRAME_BUDGET_MS.toFixed(1)} ms. Full langsamer: ${fullSlower ? 'ja' : 'nein'}. Heavy: ${POSE_HEAVY_ENABLED ? 'an' : POSE_HEAVY_REASON}. Clip: ${clipKind}${annotated ? ' + annotiert' : ''}${simulation ? ' · SIMULATION' : ' · echte Pixel'}.`

  return {
    verdict,
    promoteFull: false,
    applyFullToProduct: false,
    loadHeavy: false,
    reason,
    accuracyNote,
    runtimeNote,
  }
}

function fmtDeg(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}°`
}

export function formatDecisionNote(report: PoseCompareReport): string {
  const d = report.decision
  return [
    `VERDICT ${d.verdict} · promoteFull=${d.promoteFull} · applyFullToProduct=${d.applyFullToProduct} · heavy=${d.loadHeavy}`,
    d.reason,
    `ACCURACY  ${d.accuracyNote}`,
    `RUNTIME   ${d.runtimeNote}`,
    `CLIP      ${report.clip.kind} · ${report.clip.name} · ${report.clip.frames} frames · ${report.clip.width}×${report.clip.height} · detector=${report.detector} · ${report.clip.simulation ? 'SIMULATION' : 'echte Pixel'}`,
  ].join('\n')
}
