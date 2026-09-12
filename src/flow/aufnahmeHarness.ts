import { makeSetupId } from '../camera/setupId.ts'
import { SYNTHETIC_MARKS, syntheticCrankAngleDeg, syntheticPedalPixel } from '../camera/synthetic.ts'
import {
  applyConfirmed,
  applyManualMark,
  beginDetectRun,
  cancelDetectRun,
  confirmProposal,
  fallbackManual,
  proposeFromFixture,
  type DetectSession,
} from '../calibration/propose.ts'
import { assessCalibration } from '../calibration/validity.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { createFootCollector } from '../foot/diagnostic.ts'
import { applySeekReset, resetCaptureSegment } from '../file/seekReset.ts'
import { createMeasurementCapture } from '../metrics/capture.ts'
import { createMetricsPipeline } from '../metrics/pipeline.ts'
import { createPhaseCapture } from '../metrics/phaseCapture.ts'
import { OverlayPoseFilter, poseForMetrics } from '../pose/overlayFilter.ts'
import { MeasureSideLock } from '../pose/measureSideLock.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { inferNearSide } from '../pose/nearSide.ts'
import { POSE_LANDMARK, type PoseFrame } from '../types/landmarks.ts'
import type { BikeCalibration } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PhaseImage } from '../types/phase.ts'
import { flowCalibrateReady } from './calibrateReady.ts'
import { remasureSetupValid } from './navPolicy.ts'

export type AufnahmeHarnessCase = { name: string; passed: boolean; detail: string }
export type AufnahmeHarnessResult = { passed: boolean; cases: AufnahmeHarnessCase[]; message: string }

const VIDEO = { source: 'synthetic' as const, deviceId: null, width: 1280, height: 720 }
const BINDING = {
  source: 'synthetic' as const,
  deviceId: null,
  width: 1280,
  height: 720,
  setupId: makeSetupId(VIDEO),
}

const STUB_JPEG: PhaseImage = { mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==' }
const MS_PER_REV = (60 / 80) * 1000

function check(name: string, passed: boolean, detail: string): AufnahmeHarnessCase {
  return { name, passed, detail }
}

function lockedPedal(timestampMs: number): PedalSample {
  const angle = syntheticCrankAngleDeg(timestampMs)
  return {
    timestampMs,
    pixel: syntheticPedalPixel(timestampMs),
    crankAngleDeg: angle,
    phase01: angle / 360,
    revolutions: Math.floor(timestampMs / MS_PER_REV),
    status: 'locked',
    lostFrames: 0,
  }
}

function swapNearSide(pose: PoseFrame): PoseFrame {
  const landmarks = pose.landmarks.map((lm) => ({ ...lm }))
  const pairs: Array<[number, number]> = [
    [POSE_LANDMARK.LEFT_SHOULDER, POSE_LANDMARK.RIGHT_SHOULDER],
    [POSE_LANDMARK.LEFT_ELBOW, POSE_LANDMARK.RIGHT_ELBOW],
    [POSE_LANDMARK.LEFT_WRIST, POSE_LANDMARK.RIGHT_WRIST],
    [POSE_LANDMARK.LEFT_HIP, POSE_LANDMARK.RIGHT_HIP],
    [POSE_LANDMARK.LEFT_KNEE, POSE_LANDMARK.RIGHT_KNEE],
    [POSE_LANDMARK.LEFT_ANKLE, POSE_LANDMARK.RIGHT_ANKLE],
    [POSE_LANDMARK.LEFT_HEEL, POSE_LANDMARK.RIGHT_HEEL],
    [POSE_LANDMARK.LEFT_FOOT_INDEX, POSE_LANDMARK.RIGHT_FOOT_INDEX],
  ]
  for (const [left, right] of pairs) {
    const a = landmarks[left]
    const b = landmarks[right]
    if (!a || !b) continue
    landmarks[left] = b
    landmarks[right] = a
  }
  return { ...pose, landmarks, nearSide: 'left' }
}

function hideSide(pose: PoseFrame, side: 'left' | 'right'): PoseFrame {
  const hide = new Set<number>(
    side === 'left'
      ? [
          POSE_LANDMARK.LEFT_SHOULDER,
          POSE_LANDMARK.LEFT_ELBOW,
          POSE_LANDMARK.LEFT_WRIST,
          POSE_LANDMARK.LEFT_HIP,
          POSE_LANDMARK.LEFT_KNEE,
          POSE_LANDMARK.LEFT_ANKLE,
          POSE_LANDMARK.LEFT_HEEL,
          POSE_LANDMARK.LEFT_FOOT_INDEX,
        ]
      : [
          POSE_LANDMARK.RIGHT_SHOULDER,
          POSE_LANDMARK.RIGHT_ELBOW,
          POSE_LANDMARK.RIGHT_WRIST,
          POSE_LANDMARK.RIGHT_HIP,
          POSE_LANDMARK.RIGHT_KNEE,
          POSE_LANDMARK.RIGHT_ANKLE,
          POSE_LANDMARK.RIGHT_HEEL,
          POSE_LANDMARK.RIGHT_FOOT_INDEX,
        ],
  )
  return {
    ...pose,
    landmarks: pose.landmarks.map((lm, i) => (hide.has(i) ? { ...lm, visibility: 0.05 } : lm)),
    nearSide: undefined,
  }
}

function mountProvider(opts: {
  assessmentOk: boolean
  applied: Pick<BikeCalibration, 'imageGeneration'>
  detect: Pick<DetectSession, 'phase' | 'imageGeneration'>
}) {
  const calibrateReady = flowCalibrateReady({
    calibration: {
      assessment: { ok: opts.assessmentOk },
      data: opts.applied,
      detect: opts.detect,
    },
  })
  return {
    calibrateReady,
    canAdvance: calibrateReady,
    remasureOk: remasureSetupValid({ cameraReady: true, calibrateReady }),
  }
}

function finding4(cases: AufnahmeHarnessCase[]): void {
  const confirmed = confirmProposal(proposeFromFixture({ imageGeneration: 1 }))
  const applied = applyConfirmed(confirmed, BINDING)
  const cal = applied.calibration
  const geometry = cal ? assessCalibration(cal, VIDEO).ok : false

  const afterConfirm = mountProvider({
    assessmentOk: geometry,
    applied: { imageGeneration: cal?.imageGeneration },
    detect: confirmed,
  })
  cases.push(
    check(
      'F4 mounted provider: full confirm of gen 1 unlocks measure',
      afterConfirm.calibrateReady === true &&
        afterConfirm.canAdvance === true &&
        cal?.imageGeneration === 1 &&
        geometry,
      `ready=${afterConfirm.calibrateReady} gen=${cal?.imageGeneration}`,
    ),
  )

  const running = beginDetectRun({ imageGeneration: 2, source: 'synthetic' })
  const afterNewDetect = mountProvider({
    assessmentOk: geometry,
    applied: { imageGeneration: cal?.imageGeneration },
    detect: running,
  })
  cases.push(
    check(
      'F4 confirm → new detect without confirm: blocked (geometry still ok)',
      geometry === true && afterNewDetect.calibrateReady === false && afterNewDetect.remasureOk === false,
      `geometry=${geometry} ready=${afterNewDetect.calibrateReady}`,
    ),
  )

  const aborted = cancelDetectRun(confirmed)
  const afterAbort = mountProvider({
    assessmentOk: geometry,
    applied: { imageGeneration: cal?.imageGeneration },
    detect: aborted,
  })
  cases.push(
    check(
      'F4 abort is a conscious return to the old setup, not old coords under the new image',
      aborted.phase === 'applied' &&
        aborted.imageGeneration === 1 &&
        afterAbort.calibrateReady === true,
      `phase=${aborted.phase} gen=${aborted.imageGeneration} ready=${afterAbort.calibrateReady}`,
    ),
  )

  const occludedNew = proposeFromFixture({
    occludeB: true,
    imageGeneration: 2,
    previous: confirmed,
  })
  const partial = confirmProposal(occludedNew)
  const mixed = applyConfirmed(partial, BINDING, cal)
  const partialGeometry = mixed.calibration ? assessCalibration(mixed.calibration, VIDEO).ok : false
  const afterPartial = mountProvider({
    assessmentOk: partialGeometry || geometry,
    applied: { imageGeneration: mixed.calibration?.imageGeneration ?? cal?.imageGeneration },
    detect: partial,
  })
  cases.push(
    check(
      'F4 only S/G reconfirm, B uncertain: no mix of old B + blocked',
      partial.phase === 'review' &&
        mixed.calibration?.marks.B == null &&
        mixed.calibration?.marks.S != null &&
        mixed.calibration?.imageGeneration === 2 &&
        afterPartial.calibrateReady === false,
      `B=${mixed.calibration?.marks.B ? 'kept' : 'null'} phase=${partial.phase} ready=${afterPartial.calibrateReady}`,
    ),
  )

  const fullNew = confirmProposal(proposeFromFixture({ imageGeneration: 2, previous: confirmed }))
  const appliedNew = applyConfirmed(fullNew, BINDING, cal)
  const newGeometry = appliedNew.calibration ? assessCalibration(appliedNew.calibration, VIDEO).ok : false
  const afterFullNew = mountProvider({
    assessmentOk: newGeometry,
    applied: { imageGeneration: appliedNew.calibration?.imageGeneration },
    detect: fullNew,
  })
  cases.push(
    check(
      'F4 full valid confirm of the new generation unlocks measure',
      fullNew.phase === 'applied' &&
        appliedNew.calibration?.imageGeneration === 2 &&
        newGeometry &&
        afterFullNew.calibrateReady === true,
      `phase=${fullNew.phase} gen=${appliedNew.calibration?.imageGeneration} ready=${afterFullNew.calibrateReady}`,
    ),
  )
}

function findingManualGeneration(cases: AufnahmeHarnessCase[]): void {
  const confirmed = confirmProposal(proposeFromFixture({ imageGeneration: 1 }))
  const applied = applyConfirmed(confirmed, BINDING)
  const cal = applied.calibration
  const geometry = cal ? assessCalibration(cal, VIDEO).ok : false
  const newB = { x: SYNTHETIC_MARKS.B.x + 40, y: SYNTHETIC_MARKS.B.y + 20 }
  const newS = { x: SYNTHETIC_MARKS.S.x + 40, y: SYNTHETIC_MARKS.S.y + 20 }
  const newG = { x: SYNTHETIC_MARKS.G.x + 40, y: SYNTHETIC_MARKS.G.y + 20 }

  const running = beginDetectRun({ imageGeneration: 2, source: 'synthetic' })
  const manual = fallbackManual(running)
  const onePoint = cal ? applyManualMark(cal, 'B', newB, { binding: BINDING, imageGeneration: 2 }) : null
  const oneGeom = onePoint ? assessCalibration(onePoint, VIDEO).ok : false
  const afterOne = mountProvider({
    assessmentOk: oneGeom,
    applied: { imageGeneration: onePoint?.imageGeneration },
    detect: manual,
  })
  cases.push(
    check(
      'F4b mounted: new capture → manual → one point does not reuse old S/G; measure blocked',
      geometry === true &&
        cal != null &&
        cal.marks.S != null &&
        cal.marks.G != null &&
        onePoint != null &&
        onePoint.marks.B?.x === newB.x &&
        onePoint.marks.S == null &&
        onePoint.marks.G == null &&
        onePoint.imageGeneration === 2 &&
        oneGeom === false &&
        manual.phase === 'manual' &&
        manual.imageGeneration === 2 &&
        afterOne.calibrateReady === false &&
        afterOne.canAdvance === false &&
        afterOne.remasureOk === false,
      `S=${onePoint?.marks.S ? 'kept' : 'null'} G=${onePoint?.marks.G ? 'kept' : 'null'} ready=${afterOne.calibrateReady} geom=${oneGeom}`,
    ),
  )

  const twoPoints = onePoint ? applyManualMark(onePoint, 'S', newS, { binding: BINDING, imageGeneration: 2 }) : null
  const afterTwo = mountProvider({
    assessmentOk: twoPoints ? assessCalibration(twoPoints, VIDEO).ok : false,
    applied: { imageGeneration: twoPoints?.imageGeneration },
    detect: manual,
  })
  cases.push(
    check(
      'F4b mounted: two new-generation manual points still block measure',
      twoPoints?.marks.B != null &&
        twoPoints.marks.S?.x === newS.x &&
        twoPoints.marks.G == null &&
        afterTwo.calibrateReady === false,
      `ready=${afterTwo.calibrateReady} G=${twoPoints?.marks.G ? 'kept' : 'null'}`,
    ),
  )

  const allNew = twoPoints ? applyManualMark(twoPoints, 'G', newG, { binding: BINDING, imageGeneration: 2 }) : null
  const allGeom = allNew ? assessCalibration(allNew, VIDEO).ok : false
  const afterAll = mountProvider({
    assessmentOk: allGeom,
    applied: { imageGeneration: allNew?.imageGeneration },
    detect: manual,
  })
  cases.push(
    check(
      'F4b mounted: B+S+G of the new generation unlock measure',
      allNew != null &&
        allNew.marks.B?.x === newB.x &&
        allNew.marks.S?.x === newS.x &&
        allNew.marks.G?.x === newG.x &&
        allNew.imageGeneration === 2 &&
        allGeom === true &&
        afterAll.calibrateReady === true &&
        afterAll.canAdvance === true,
      `ready=${afterAll.calibrateReady} geom=${allGeom} gen=${allNew?.imageGeneration}`,
    ),
  )
}

function finding5(cases: AufnahmeHarnessCase[]): void {
  const transform = computePixelBikeTransform({
    B: { ...SYNTHETIC_MARKS.B },
    S: { ...SYNTHETIC_MARKS.S },
    G: { ...SYNTHETIC_MARKS.G },
  })
  const pipeline = createMetricsPipeline()
  const capture = createMeasurementCapture({ targetRevs: 99, idFactory: () => `seg-${Math.random().toString(36).slice(2, 8)}` })
  const phase = createPhaseCapture()
  const foot = createFootCollector()
  let evidence: ReturnType<typeof phase.freeze> | null = null
  let media: { start: number; end: number } | null = null
  const lock = new MeasureSideLock({ sideLockMs: 0 })

  const pushWindow = (fromMs: number, toMs: number, step = 20) => {
    let range: { start: number; end: number } | null = media
    for (let t = fromMs; t <= toMs; t += step) {
      const raw = syntheticPoseFrame(t)
      const measure = lock.apply(raw)
      const pose = measure.pose ?? raw
      const pedal = lockedPedal(t)
      const frame = { timestampMs: t, pose, pedal, transform }
      pipeline.push(frame)
      capture.push(frame)
      phase.push(frame, { ...STUB_JPEG, dataUrl: `data:image/jpeg;base64,${t}` })
      foot.push(pose, pedal)
      const start = range?.start ?? t
      range = { start, end: t }
    }
    media = range
    return range
  }

  const sinks = {
    resetPedalTemporal() {},
    resetMetrics() {
      pipeline.reset()
    },
    resetCaptureAggregators() {
      resetCaptureSegment({
        resetMetricsAggregator: () => {
          capture.openNewSegment()
        },
        resetPhaseCapture: () => {
          phase.reset()
        },
        clearPhaseEvidence: () => {
          evidence = null
        },
        resetFoot: () => {
          foot.reset()
        },
        resetMediaRange: () => {
          media = null
        },
        resetMeasureSideLock: () => {
          lock.reset()
        },
      })
    },
  }

  capture.beginRecording()
  const idBefore = capture.snapshot().id
  pushWindow(0, 400)
  const stampsA = [0, 200, 400]
  const kind = applySeekReset(sinks, 400, 5000)
  const idAfter = capture.snapshot().id
  const rangeB = pushWindow(5000, 5400)
  const finished = capture.finish()
  evidence = phase.freeze({
    calibration: {
      version: 1,
      marks: { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } },
      transform,
      createdAt: '2026-09-11T12:00:00.000Z',
      updatedAt: '2026-09-11T12:00:00.000Z',
    },
    side: 'right',
    source: 'synthetic',
    metricMethod: 'bottom_dead_center',
  })
  const phaseStamps = phase.snapshot().map((f) => f.timestampMs)
  const footStamps = foot.samples().map((s) => s.timestampMs)
  const evidenceStamps = evidence.slots
    .map((slot) => slot.frame?.timestampMs)
    .filter((t): t is number => typeof t === 'number')
  const cycleStamps = finished.report.cycles.flatMap((c) => [c.startMs, c.endMs])
  const leakedA =
    phaseStamps.some((t) => stampsA.includes(t) || t < 5000) ||
    footStamps.some((t) => t < 5000) ||
    evidenceStamps.some((t) => t < 5000) ||
    cycleStamps.some((t) => t < 5000) ||
    (rangeB != null && rangeB.start < 5000)

  cases.push(
    check(
      'F5 seek opens a new segment id and drops frames A from metrics/phase/foot/media',
      kind === 'forward' &&
        idBefore !== idAfter &&
        idAfter != null &&
        phaseStamps.length > 0 &&
        footStamps.length > 0 &&
        rangeB != null &&
        rangeB.start >= 5000 &&
        rangeB.end >= 5000 &&
        leakedA === false,
      `kind=${kind} id ${idBefore}→${idAfter} phase=${phaseStamps[0]}..${phaseStamps[phaseStamps.length - 1]} foot=${footStamps[0]} media=${rangeB?.start}-${rangeB?.end} leak=${leakedA}`,
    ),
  )
}

function runSideSequence(filterOn: boolean): {
  sides: Array<'left' | 'right' | undefined>
  needsNewTake: boolean
  mixed: boolean
} {
  const lock = new MeasureSideLock()
  const overlay = new OverlayPoseFilter()
  const sides: Array<'left' | 'right' | undefined> = []
  let needsNewTake = false

  const consume = (raw: PoseFrame) => {
    const draw = filterOn ? overlay.apply(raw).frame : raw
    const kept = poseForMetrics(raw, draw)
    const measure = lock.apply(kept)
    if (measure.lockedSide && measure.pose) {
      sides.push(measure.pose.nearSide)
      if (measure.needsNewTake) needsNewTake = true
    }
  }

  consume(syntheticPoseFrame(0))
  consume(syntheticPoseFrame(80))
  consume(syntheticPoseFrame(180))
  consume(syntheticPoseFrame(200))
  const flipped = hideSide(swapNearSide(syntheticPoseFrame(260)), 'right')
  consume(flipped)
  consume(hideSide(swapNearSide(syntheticPoseFrame(320)), 'right'))
  const unique = new Set(sides)
  return { sides, needsNewTake, mixed: unique.size > 1 }
}

function finding6(cases: AufnahmeHarnessCase[]): void {
  const off = runSideSequence(false)
  const on = runSideSequence(true)
  const inferredFlip = inferNearSide(hideSide(swapNearSide(syntheticPoseFrame(260)), 'right').landmarks, 0.75)
  cases.push(
    check(
      'F6 same side-switch/occlusion with filter off: locked chain only, no mix',
      off.sides.length > 0 &&
        off.sides.every((side) => side === 'right') &&
        off.needsNewTake === true &&
        off.mixed === false &&
        inferredFlip === 'left',
      `sides=${off.sides.join(',')} newTake=${off.needsNewTake} infer=${inferredFlip}`,
    ),
  )
  cases.push(
    check(
      'F6 same sequence with filter on: same lock, no silent L/R mix',
      on.sides.length > 0 &&
        on.sides.every((side) => side === 'right') &&
        on.needsNewTake === true &&
        on.mixed === false &&
        on.sides.length === off.sides.length,
      `on=${on.sides.join(',')} off=${off.sides.join(',')}`,
    ),
  )

  const conscious = new MeasureSideLock()
  conscious.apply(syntheticPoseFrame(0))
  conscious.apply(syntheticPoseFrame(180))
  const before = conscious.locked()
  conscious.changeSide('left')
  const afterChange = conscious.apply(hideSide(syntheticPoseFrame(400), 'right'))
  cases.push(
    check(
      'F6 conscious side change is a new lock, not a mix into the old take',
      before === 'right' && afterChange.lockedSide === 'left' && afterChange.pose?.nearSide === 'left',
      `before=${before} after=${afterChange.lockedSide}`,
    ),
  )
}

export function runAufnahmeHarness(): AufnahmeHarnessResult {
  const cases: AufnahmeHarnessCase[] = []
  finding4(cases)
  findingManualGeneration(cases)
  finding5(cases)
  finding6(cases)
  const failed = cases.filter((c) => !c.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `AUFNAHME_OK — ${cases.length} checks (findings 4–6 + manual generation).`
        : `AUFNAHME_FAIL — ${failed.map((c) => c.name).join(', ')}`,
  }
}
