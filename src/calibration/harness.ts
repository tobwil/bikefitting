import { makeSetupId } from '../camera/setupId.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { emptyCalibration } from './storage.ts'
import { assessCalibration } from './validity.ts'
import { detectBikeFromPixels, detectFromObjectClass, knownRefsInside } from './detect.ts'
import { renderFixtureStill, fixtureRefs } from './fixtureStill.ts'
import {
  applyConfirmed,
  assessProposal,
  confirmGripContact,
  confirmProposal,
  correctPoint,
  emptyDetectSession,
  fallbackManual,
  gripContactPending,
  lockDetect,
  proposeFromFixture,
  proposeFromImage,
  rejectClassLabel,
  selectCandidate,
} from './propose.ts'

export type CalibHarnessCase = { name: string; passed: boolean; detail: string }
export type CalibHarnessResult = { passed: boolean; cases: CalibHarnessCase[]; message: string }

const video = { source: 'synthetic' as const, deviceId: null, width: 1280, height: 720 }
const binding = {
  source: 'synthetic' as const,
  deviceId: null,
  width: 1280,
  height: 720,
  setupId: makeSetupId(video),
}

function check(name: string, passed: boolean, detail: string): CalibHarnessCase {
  return { name, passed, detail }
}

export function runCalibrationHarness(): CalibHarnessResult {
  const cases: CalibHarnessCase[] = []

  const classOut = detectFromObjectClass('bicycle')
  cases.push(
    check(
      'class bicycle is not B/S/G',
      classOut.candidates.length === 0 && /keine Kalibrierung/i.test(classOut.message),
      classOut.message,
    ),
  )
  const rejected = rejectClassLabel('bicycle')
  cases.push(
    check('class-label path is failed/manual-ready', rejected.phase === 'failed' && rejected.candidates.length === 0, rejected.phase),
  )

  const pixels = renderFixtureStill()
  const geo = detectBikeFromPixels(pixels)
  const refs = fixtureRefs()
  const geoHit = geo.candidates[0] ? knownRefsInside(geo.candidates[0], refs, 36) : false
  const geoPts = geo.candidates[0]?.points
  cases.push(
    check(
      'geometry detector finds fixture B/S/G near refs',
      geo.candidates.length === 1 && geoHit,
      geoPts
        ? `B ${geoPts.B?.pixel.x.toFixed(0)},${geoPts.B?.pixel.y.toFixed(0)} S ${geoPts.S?.pixel.x.toFixed(0)},${geoPts.S?.pixel.y.toFixed(0)} G ${geoPts.G?.pixel.x.toFixed(0)},${geoPts.G?.pixel.y.toFixed(0)}`
        : geo.message,
    ),
  )

  const proposed = proposeFromImage(pixels)
  cases.push(
    check(
      'propose marks status vorgeschlagen',
      proposed.phase === 'review' &&
        proposed.candidates[0]?.points.B?.status === 'proposed' &&
        proposed.candidates[0]?.points.S?.status === 'proposed' &&
        proposed.candidates[0]?.points.G?.status === 'proposed',
      `${proposed.phase} ${proposed.candidates[0]?.points.B?.status}`,
    ),
  )

  const preview = assessProposal(proposed, video)
  cases.push(
    check(
      'geometry alone is not confirmed calibration',
      preview.geometryOk === true && preview.ok === false,
      preview.message,
    ),
  )
  const silent = applyConfirmed(proposed, binding)
  cases.push(
    check(
      'unconfirmed propose does not apply BikeCalibration',
      silent.calibration === null && silent.applied.length === 0,
      silent.reason,
    ),
  )

  const confirmed = confirmProposal(proposed)
  const applied = applyConfirmed(confirmed, binding)
  const ready = applied.calibration ? assessCalibration(applied.calibration, video) : null
  cases.push(
    check(
      'confirm without three new clicks applies ready BikeCalibration',
      confirmed.phase === 'applied' &&
        Boolean(applied.calibration?.marks.B && applied.calibration.marks.S && applied.calibration.marks.G) &&
        ready?.ok === true &&
        applied.calibration?.detect?.version.detector === 'geometry.v1' &&
        applied.calibration?.provenance?.B?.origin === 'auto' &&
        applied.calibration?.provenance?.S?.status === 'confirmed',
      ready?.message ?? applied.reason,
    ),
  )

  const fixture = proposeFromFixture()
  const fixtureOk = confirmProposal(fixture)
  const fixtureCal = applyConfirmed(fixtureOk, binding)
  cases.push(
    check(
      'fixture path propose→confirm→apply',
      fixtureOk.phase === 'applied' &&
        fixtureCal.calibration?.marks.B?.x === SYNTHETIC_MARKS.B.x &&
        fixtureCal.calibration?.marks.S?.y === SYNTHETIC_MARKS.S.y,
      `B=${fixtureCal.calibration?.marks.B?.x}`,
    ),
  )

  const dragged = correctPoint(confirmed, 'S', { x: SYNTHETIC_MARKS.S.x + 12, y: SYNTHETIC_MARKS.S.y - 4 })
  const afterCorrect = applyConfirmed(dragged, binding)
  const re = proposeFromFixture({ previous: dragged })
  cases.push(
    check(
      'corrected S is not overwritten by re-detect',
      dragged.candidates[0]?.points.S?.status === 'corrected' &&
        afterCorrect.calibration?.provenance?.S?.origin === 'corrected' &&
        re.candidates[0]?.points.S?.status === 'corrected' &&
        re.candidates[0]?.points.S?.pixel.x === SYNTHETIC_MARKS.S.x + 12,
      `${re.candidates[0]?.points.S?.status} x=${re.candidates[0]?.points.S?.pixel.x}`,
    ),
  )

  const occluded = proposeFromFixture({ occludeB: true })
  const occludedConfirm = confirmProposal(occluded)
  const occludedApply = applyConfirmed(occludedConfirm, binding)
  cases.push(
    check(
      'occluded B stays uncertain and is not silent-confirmed',
      occluded.candidates[0]?.points.B?.uncertain === true &&
        occludedConfirm.candidates[0]?.points.B?.status === 'proposed' &&
        occludedApply.calibration?.marks.B == null,
      `${occludedConfirm.candidates[0]?.points.B?.status} applied=${occludedApply.applied.join(',')}`,
    ),
  )

  const blank = proposeFromImage(renderFixtureStill({ empty: true }))
  cases.push(
    check(
      'empty still fails open to manual',
      blank.phase === 'failed' && /manuell/i.test(blank.message),
      `${blank.phase} ${blank.message}`,
    ),
  )
  const manual = fallbackManual(blank)
  cases.push(check('manual fallback does not block', manual.phase === 'manual', manual.phase))

  const flat = proposeFromImage(renderFixtureStill({ badPerspective: true }))
  cases.push(
    check(
      'bad perspective asks to reposition',
      /perspektiv|ausrichten|flach/i.test(flat.message + (flat.candidates[0]?.message ?? '')),
      flat.message,
    ),
  )

  const many = proposeFromFixture({ extraBike: true })
  const noPick = confirmProposal(many)
  const picked = selectCandidate(many, 'bike-2')
  const pickedOk = confirmProposal(picked)
  cases.push(
    check(
      'several bikes require a pick',
      many.selectedId === null && noPick.phase === 'review' && pickedOk.phase === 'applied' && picked.selectedId === 'bike-2',
      `sel=${many.selectedId} after=${pickedOk.phase}`,
    ),
  )

  const noRider = confirmProposal(proposeFromFixture({ riderPresent: false }))
  cases.push(
    check(
      'without rider G is provisional bike_ref',
      noRider.gripContact === 'bike_ref' && noRider.candidates[0]?.points.G?.gripKind === 'bike_ref',
      noRider.gripContact,
    ),
  )
  const withRider = confirmProposal(proposeFromFixture({ rider: true, riderPresent: true }))
  const pending = gripContactPending(withRider, applyConfirmed(withRider, binding).calibration ?? emptyCalibration())
  const handed = confirmGripContact(withRider, 'hand')
  cases.push(
    check(
      'rider path confirms G contact on body step',
      pending === true && handed.gripContact === 'hand' && !gripContactPending(handed, applyConfirmed(handed, binding).calibration!),
      `pending=${String(pending)} grip=${handed.gripContact}`,
    ),
  )

  const locked = lockDetect(confirmProposal(proposeFromFixture()), true)
  const lockedAgain = proposeFromFixture({ previous: locked })
  const lockedCorrect = correctPoint(locked, 'B', { x: 1, y: 1 })
  cases.push(
    check(
      'locked session does not re-estimate during recording',
      lockedAgain.locked && lockedCorrect.candidates[0]?.points.B?.pixel.x === SYNTHETIC_MARKS.B.x,
      `locked=${String(lockedAgain.locked)} Bx=${lockedCorrect.candidates[0]?.points.B?.pixel.x}`,
    ),
  )

  const setupB = { ...binding, setupId: makeSetupId({ ...video, source: 'camera', deviceId: 'cam' }) }
  const moved = applied.calibration
    ? assessCalibration(applied.calibration, { ...video, source: 'camera', deviceId: 'cam' })
    : null
  cases.push(
    check(
      'camera move invalidates old calibration (reconfirm)',
      moved?.ok === false && moved.issues.includes('source_mismatch') && setupB.setupId !== binding.setupId,
      moved?.message ?? 'no cal',
    ),
  )

  cases.push(
    check(
      'idle session is empty and unused',
      emptyDetectSession().phase === 'idle' && emptyDetectSession().candidates.length === 0,
      'idle',
    ),
  )

  const failed = cases.filter((c) => !c.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `CALIB_HARNESS_OK — ${cases.length} checks.`
        : `CALIB_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`,
  }
}
