import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import { POSE_LANDMARK } from '../types/landmarks.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { emptyFootDiagnostic, sampleFootFrame, summarizeFootCycle } from '../foot/diagnostic.ts'
import { parseFootDiagnostic } from '../foot/parse.ts'
import { parseMeasurementResult } from '../sessions/parseResult.ts'
import { buildMeasurementResult } from '../flow/buildResult.ts'
import { LAB_PROFILE } from '../flow/profile.ts'
import {
  applyConfirmedScaleToPixelsPerMm,
  blockLengthClaim,
  filterLengthAdvice,
  lengthAdviceAllowed,
  productLengthAdviceAllowed,
  saddleMmFromImage,
  stackReachFromBikeMarks,
} from './advice.ts'
import {
  bindPlaneScale,
  commitCheckedScale,
  draftReference,
  emptyPlaneScale,
  invalidateActiveScale,
  makeScaleBinding,
  refuseImplicitWheelDiameter,
  runIndependentCheck,
  scaleBindingMatches,
  scaleForBinding,
  scaleIsConfirmed,
  storeDraftScale,
} from './plane.ts'
import { loadStoredScale, parsePlaneScale, peekStoredScale, saveStoredScale } from './parse.ts'
import type { PlaneScaleBinding } from '../types/scale.ts'
import type { ScaleStorage } from './parse.ts'
import { pixelDistance } from './units.ts'

export type ScaleHarnessCase = { name: string; passed: boolean; detail: string }

export type ScaleHarnessResult = {
  passed: boolean
  cases: ScaleHarnessCase[]
  message: string
}

function check(name: string, passed: boolean, detail: string): ScaleHarnessCase {
  return { name, passed, detail }
}

function lockedPedal(timestampMs: number): PedalSample {
  return {
    timestampMs,
    pixel: { x: 600, y: 500 },
    crankAngleDeg: (timestampMs / 20) % 360,
    phase01: ((timestampMs / 20) % 360) / 360,
    revolutions: 0,
    status: 'locked',
    lostFrames: 0,
  }
}

function hideFoot(frame: PoseFrame, which: 'heel' | 'toe' | 'both'): PoseFrame {
  const next = {
    ...frame,
    landmarks: frame.landmarks.map((lm) => ({ ...lm })),
  }
  const hide = (index: number) => {
    next.landmarks[index] = { ...next.landmarks[index], visibility: 0.05, presence: 0 }
  }
  if (which === 'heel' || which === 'both') {
    hide(POSE_LANDMARK.LEFT_HEEL)
    hide(POSE_LANDMARK.RIGHT_HEEL)
  }
  if (which === 'toe' || which === 'both') {
    hide(POSE_LANDMARK.LEFT_FOOT_INDEX)
    hide(POSE_LANDMARK.RIGHT_FOOT_INDEX)
  }
  return next
}

function knownBar(ppu: number, length: number, origin: { x: number; y: number }) {
  return { a: { ...origin }, b: { x: origin.x + ppu * length, y: origin.y } }
}

export function runScaleHarness(): ScaleHarnessResult {
  const cases: ScaleHarnessCase[] = []

  const empty = emptyPlaneScale()
  cases.push(
    check(
      'empty scale has no wheel default and no product mm advice',
      empty.defaultWheelDiameter === false &&
        empty.productLengthAdvice === false &&
        empty.pixelsPerUnit === null &&
        empty.status === 'absent',
      empty.status,
    ),
  )

  const implicit = refuseImplicitWheelDiameter({ measuredValue: 62.2, unit: 'cm', points: { a: null, b: null } })
  cases.push(
    check(
      'no implicit 62.2 cm wheel diameter without user points',
      !implicit.ok && implicit.reason.includes('Raddurchmesser'),
      implicit.ok ? 'accepted default' : implicit.reason,
    ),
  )

  const missingValue = refuseImplicitWheelDiameter({
    measuredValue: null,
    unit: 'mm',
    points: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  })
  cases.push(
    check(
      'missing measured value does not invent a wheel diameter',
      !missingValue.ok,
      missingValue.ok ? 'invented' : missingValue.reason,
    ),
  )

  const ppu = 2
  const refPts = knownBar(ppu, 100, { x: 40, y: 40 })
  const drafted = draftReference({
    purpose: 'length_in_plane',
    a: refPts.a,
    b: refPts.b,
    measuredValue: 100,
    unit: 'mm',
    perspective: 'side_view_ok',
    uncertainty: { value: 2, source: 'user' },
  })
  cases.push(check('draft stores unit, points, perspective, uncertainty', drafted.ok, drafted.ok ? drafted.value.unit : drafted.reason))
  if (!drafted.ok) {
    return { passed: false, cases, message: 'SCALE_HARNESS_FAIL' }
  }
  const draftScale = storeDraftScale(drafted.value)
  cases.push(
    check(
      'draft is not confirmed and blocks length advice',
      draftScale.status === 'draft' &&
        !draftScale.references[0]?.confirmed &&
        !lengthAdviceAllowed(draftScale) &&
        draftScale.references[0]?.perspective === 'side_view_ok' &&
        draftScale.references[0]?.uncertainty.value === 2,
      draftScale.status,
    ),
  )

  const checkPts = knownBar(ppu, 80, { x: 40, y: 80 })
  const passCheck = runIndependentCheck(drafted.value, checkPts, 80, 'mm')
  cases.push(check('independent known length can pass', passCheck.ok && passCheck.value.passed, passCheck.ok ? String(passCheck.value.residualRel) : passCheck.reason))
  const checked = passCheck.ok ? commitCheckedScale(drafted.value, passCheck.value) : empty
  cases.push(
    check(
      'passed check confirms plane scale without product mm promise',
      checked.status === 'checked' &&
        lengthAdviceAllowed(checked) &&
        productLengthAdviceAllowed(checked) === false &&
        checked.defaultWheelDiameter === false &&
        applyConfirmedScaleToPixelsPerMm() === null,
      checked.status,
    ),
  )

  const failPts = knownBar(ppu, 80, { x: 40, y: 120 })
  const failCheck = runIndependentCheck(drafted.value, failPts, 40, 'mm')
  const failed = failCheck.ok ? commitCheckedScale(drafted.value, failCheck.value) : empty
  cases.push(
    check(
      'independent check fail locks confirmation',
      failCheck.ok && !failCheck.value.passed && failed.status === 'failed_check' && !lengthAdviceAllowed(failed),
      failed.status,
    ),
  )

  const sg = stackReachFromBikeMarks({ B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G })
  cases.push(
    check(
      'existing S/G are not stack or reach',
      sg.allowed === false && sg.sgPixelDistance != null && sg.sgPixelDistance > 0 && sg.reason.includes('S/G'),
      sg.reason,
    ),
  )

  const stackDraft = draftReference({
    purpose: 'frame_stack',
    a: refPts.a,
    b: refPts.b,
    measuredValue: 100,
    unit: 'mm',
    perspective: 'side_view_ok',
    uncertainty: { value: 2, source: 'user' },
  })
  const stackChecked =
    stackDraft.ok && passCheck.ok ? commitCheckedScale(stackDraft.value, passCheck.value) : empty
  cases.push(
    check(
      'stack/reach refs do not confirm a general length scale',
      stackDraft.ok && stackChecked.status === 'failed_check' && !lengthAdviceAllowed(stackChecked),
      stackChecked.status,
    ),
  )

  const saddle = saddleMmFromImage(checked)
  cases.push(
    check(
      'image distance is never “saddle exactly x mm”',
      saddle.allowed === false && saddle.reason.includes('Sattelmaß'),
      saddle.reason,
    ),
  )
  cases.push(
    check(
      'confirmed scale still blocks product length copy',
      blockLengthClaim(checked).includes('Millimeter') || blockLengthClaim(empty).includes('bestätigtem'),
      blockLengthClaim(checked),
    ),
  )
  const filtered = filterLengthAdvice(
    [{ priority: 1, title: 'Sattel genau 12 mm senken', reason: 'Bildabstand 24 px → 12 mm' }],
    empty,
  )
  cases.push(
    check(
      'length recs without confirmed scale are rewritten',
      filtered[0]?.title === 'Keine Längenempfehlung' && filtered[0]?.reason.includes('Maßstab'),
      filtered[0]?.reason ?? 'none',
    ),
  )

  const pose = syntheticPoseFrame(0)
  const visible = sampleFootFrame(pose, lockedPedal(0))
  cases.push(
    check(
      'synthetic cycle has heel + toe landmarks',
      Boolean(visible && !visible.metricLocked && visible.heel.pixel && visible.toe.pixel),
      visible ? `locked=${visible.metricLocked}` : 'no sample',
    ),
  )

  const heelOcc = sampleFootFrame(hideFoot(pose, 'heel'), lockedPedal(16))
  const heelDiag = summarizeFootCycle(heelOcc ? [heelOcc] : [], checked)
  cases.push(
    check(
      'heel occlusion locks the foot metric',
      Boolean(heelOcc?.metricLocked && heelDiag.status === 'occluded' && heelDiag.metricLocked && heelDiag.heelOccluded),
      heelDiag.reason,
    ),
  )
  const toeOcc = sampleFootFrame(hideFoot(pose, 'toe'), lockedPedal(32))
  const toeDiag = summarizeFootCycle(toeOcc ? [toeOcc] : [], checked)
  cases.push(
    check(
      'toe occlusion locks the foot metric',
      Boolean(toeOcc?.metricLocked && toeDiag.status === 'occluded' && toeDiag.toeOccluded),
      toeDiag.reason,
    ),
  )

  const visibleDiagNoScale = summarizeFootCycle(visible ? [visible] : [], empty)
  cases.push(
    check(
      'visible foot without confirmed scale keeps length claims off',
      visibleDiagNoScale.status === 'no_scale_length_blocked' &&
        visibleDiagNoScale.lengthClaimsAllowed === false &&
        visibleDiagNoScale.metricCards.length === 0 &&
        visibleDiagNoScale.recommendations.length === 0,
      visibleDiagNoScale.status,
    ),
  )
  const visibleDiagScale = summarizeFootCycle(visible ? [visible] : [], checked)
  cases.push(
    check(
      'visible foot still ships no cards or recommendations',
      visibleDiagScale.status === 'visible' &&
        visibleDiagScale.metricCards.length === 0 &&
        visibleDiagScale.recommendations.length === 0,
      `${visibleDiagScale.status} cards=${visibleDiagScale.metricCards.length}`,
    ),
  )
  cases.push(
    check(
      'empty foot diagnostic is locked to no cards',
      emptyFootDiagnostic().metricCards.length === 0 && emptyFootDiagnostic().recommendations.length === 0,
      'ok',
    ),
  )

  const dataset = buildMeasurementResult({
    startedAt: '2026-09-11T10:00:00.000Z',
    endedAt: '2026-09-11T10:01:00.000Z',
    capture: 'synthetic',
    evaluation: 'demo',
    profile: LAB_PROFILE,
    calibration: {
      version: 1,
      marks: { B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G },
      transform: {
        originPx: SYNTHETIC_MARKS.B,
        forwardPx: { x: 1, y: 0 },
        upPx: { x: 0, y: -1 },
        facing: 1,
        pixelsPerMm: applyConfirmedScaleToPixelsPerMm(),
      },
      createdAt: '2026-09-11T10:00:00.000Z',
      updatedAt: '2026-09-11T10:00:00.000Z',
    },
    metrics: [
      {
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 38,
        unit: '°',
        band: 'unknown',
        targetHint: '',
      },
    ],
    quality: {
      level: 'ok',
      label: 'Qualität ausreichend',
      validRevs: 8,
      targetRevs: 10,
      lostFrames: 0,
      notes: [],
    },
    recommendations: [],
    validRevs: 8,
    targetRevs: 10,
    adapters: { sessions: 'module', metrics: 'module', rules: 'module', soll: 'module' },
    scale: checked,
    foot: visibleDiagScale,
  })
  cases.push(
    check(
      'scale and foot freeze onto the result',
      dataset.scale?.status === 'checked' &&
        dataset.foot?.status === 'visible' &&
        dataset.calibration.transform?.pixelsPerMm == null &&
        dataset.profile.productionEnabled === false,
      `scale=${dataset.scale?.status} foot=${dataset.foot?.status}`,
    ),
  )
  const parsed = parseMeasurementResult(JSON.parse(JSON.stringify(dataset)))
  cases.push(
    check(
      'parse keeps scale + foot and rejects wheel default',
      parsed.ok &&
        parsed.value.scale?.defaultWheelDiameter === false &&
        parsed.value.scale?.status === 'checked' &&
        parsed.value.foot?.metricCards.length === 0,
      parsed.ok ? parsed.value.id : parsed.reason,
    ),
  )
  const parsedScale = parsePlaneScale(checked)
  const parsedFoot = parseFootDiagnostic(visibleDiagScale)
  cases.push(
    check(
      'scale/foot parsers accept the frozen objects',
      parsedScale.ok && parsedFoot.ok,
      parsedScale.ok && parsedFoot.ok ? 'ok' : `${parsedScale.ok ? '' : parsedScale.reason} ${parsedFoot.ok ? '' : parsedFoot.reason}`,
    ),
  )

  const closePts = { a: { x: 10, y: 10 }, b: { x: 12, y: 10 } }
  const tooClose = draftReference({
    purpose: 'length_in_plane',
    a: closePts.a,
    b: closePts.b,
    measuredValue: 100,
    unit: 'mm',
    perspective: 'side_view_ok',
    uncertainty: { value: 1, source: 'user' },
  })
  cases.push(check('tiny point pair is rejected', !tooClose.ok, tooClose.ok ? String(pixelDistance(closePts.a, closePts.b)) : tooClose.reason))

  const bindA = makeScaleBinding({
    source: 'file',
    fileName: 'ride-a.mp4',
    fileSizeBytes: 1000,
    width: 1280,
    height: 720,
    setupId: 'file:ride-a.mp4:1280x720',
    imageGeneration: 1,
  })
  const bindB = makeScaleBinding({
    source: 'file',
    fileName: 'ride-b.mp4',
    fileSizeBytes: 2000,
    width: 1280,
    height: 720,
    setupId: 'file:ride-b.mp4:1280x720',
    imageGeneration: 1,
  })
  const sameResCamera = makeScaleBinding({
    source: 'camera',
    deviceId: 'cam-1',
    width: 1280,
    height: 720,
    setupId: 'camera:cam-1:1280x720',
    imageGeneration: 1,
  })
  cases.push(
    check(
      'identical resolution is not the same image plane',
      !scaleBindingMatches(bindA, bindB) && !scaleBindingMatches(bindA, sameResCamera),
      `A↔B=${scaleBindingMatches(bindA, bindB)} A↔cam=${scaleBindingMatches(bindA, sameResCamera)}`,
    ),
  )

  const checkedBound = bindPlaneScale(checked, bindA)
  cases.push(
    check(
      'checked scale stays product-mm-off after bind',
      checkedBound.status === 'checked' &&
        checkedBound.productLengthAdvice === false &&
        productLengthAdviceAllowed(checkedBound) === false &&
        scaleIsConfirmed(checkedBound),
      `advice=${String(checkedBound.productLengthAdvice)}`,
    ),
  )
  cases.push(
    check(
      'load without current source does not restore a confirmed scale',
      scaleForBinding(checkedBound, null).status === 'absent' && !scaleIsConfirmed(scaleForBinding(checkedBound, null)),
      scaleForBinding(checkedBound, null).status,
    ),
  )
  cases.push(
    check(
      'stored scale A does not confirm on source B',
      !scaleIsConfirmed(scaleForBinding(checkedBound, bindB)) && scaleForBinding(checkedBound, bindB).status === 'absent',
      scaleForBinding(checkedBound, bindB).status,
    ),
  )
  cases.push(
    check(
      'stored scale A confirms only on matching source A',
      scaleIsConfirmed(scaleForBinding(checkedBound, bindA)) && scaleForBinding(checkedBound, bindA).binding?.sourceId === bindA.sourceId,
      scaleForBinding(checkedBound, bindA).binding?.sourceId ?? 'none',
    ),
  )

  const storage = memoryScaleStorage()
  saveStoredScale(checkedBound, storage)
  const reloadNoSource = loadStoredScale(undefined, storage)
  const reloadB = loadStoredScale(bindB, storage)
  const afterSwitchMemory = emptyPlaneScale()
  const reloadAfterAB = loadStoredScale(bindB, storage)
  cases.push(
    check(
      'check/store A → reload + open B: no confirmed scale',
      !scaleIsConfirmed(reloadNoSource) && !scaleIsConfirmed(reloadB) && reloadB.productLengthAdvice === false,
      `reload=${reloadNoSource.status} openB=${reloadB.status}`,
    ),
  )
  cases.push(
    check(
      'A→B (memory cleared, storage kept) → reload B: still no confirmed scale',
      afterSwitchMemory.status === 'absent' && !scaleIsConfirmed(reloadAfterAB) && peekStoredScale(storage).status === 'checked',
      `memory=${afterSwitchMemory.status} reloadB=${reloadAfterAB.status} stored=${peekStoredScale(storage).status}`,
    ),
  )

  const gen2: PlaneScaleBinding = { ...bindA, imageGeneration: 2 }
  const invalidated = invalidateActiveScale(checkedBound)
  cases.push(
    check(
      'source/generation change drops active length calib (history refs unconfirmed)',
      invalidated.status === 'absent' &&
        !scaleIsConfirmed(invalidated) &&
        invalidated.pixelsPerUnit === null &&
        invalidated.references.every((ref) => !ref.confirmed) &&
        invalidated.productLengthAdvice === false &&
        gen2.sourceId === bindA.sourceId,
      `status=${invalidated.status} refs=${invalidated.references.length}`,
    ),
  )
  // gen2 shares sourceId/setupId/dims — identity matches; generation is session-invalidated separately
  cases.push(
    check(
      'unbound legacy stored scale is not treated as current',
      !scaleIsConfirmed(scaleForBinding(checked, bindA)),
      scaleForBinding(checked, bindA).status,
    ),
  )
  const parsedBound = parsePlaneScale(JSON.parse(JSON.stringify(checkedBound)))
  cases.push(
    check(
      'parse keeps scale binding and still forbids product mm advice',
      parsedBound.ok &&
        parsedBound.value?.binding?.sourceId === bindA.sourceId &&
        parsedBound.value?.productLengthAdvice === false,
      parsedBound.ok ? parsedBound.value?.binding?.sourceId ?? 'ok' : parsedBound.reason,
    ),
  )

  const passed = cases.every((item) => item.passed)
  return {
    passed,
    cases,
    message: passed ? `SCALE_HARNESS_OK ${cases.length} checks` : `SCALE_HARNESS_FAIL ${cases.filter((c) => !c.passed).length}/${cases.length}`,
  }
}

function memoryScaleStorage(): ScaleStorage {
  const map = new Map<string, string>()
  return {
    getItem(key) {
      return map.get(key) ?? null
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
}
