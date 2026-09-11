import { isVideoPlayable } from '../camera/attachStream.ts'
import { makeSetupId } from '../camera/setupId.ts'
import { assessCalibration } from '../calibration/validity.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { emptyCalibration } from '../calibration/storage.ts'
import { acceptSessionReply, poseFreshness, poseIsReady, POSE_LOST_MS, POSE_STALE_MS } from '../pose/freshness.ts'
import type { BikeCalibration } from '../types/calibration.ts'

export type SetupHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type SetupHarnessResult = {
  passed: boolean
  cases: SetupHarnessCase[]
  message: string
}

function cal(marks: BikeCalibration['marks'], setupId?: string): BikeCalibration {
  const now = '2026-09-11T00:00:00.000Z'
  return {
    version: 1,
    marks,
    transform: computePixelBikeTransform(marks),
    createdAt: now,
    updatedAt: now,
    binding: setupId
      ? { source: 'synthetic', deviceId: null, width: 1280, height: 720, setupId }
      : null,
  }
}

const video = { source: 'synthetic' as const, deviceId: null, width: 1280, height: 720 }

export function runSetupHarness(): SetupHarnessResult {
  const cases: SetupHarnessCase[] = []

  const idA = makeSetupId({ source: 'synthetic', deviceId: null, width: 1280, height: 720 })
  const idB = makeSetupId({ source: 'camera', deviceId: 'abc', width: 1280, height: 720 })
  const idC = makeSetupId({ source: 'camera', deviceId: 'abc', width: 1920, height: 1080 })
  cases.push({
    name: 'setup id changes with source',
    passed: idA !== idB,
    detail: `${idA} vs ${idB}`,
  })
  cases.push({
    name: 'setup id changes with resolution',
    passed: idB !== idC,
    detail: `${idB} vs ${idC}`,
  })

  const fixture = cal(
    { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } },
    idA,
  )
  const valid = assessCalibration(fixture, video)
  cases.push({
    name: 'fixture B/S/G is ready',
    passed: valid.ok,
    detail: valid.message,
  })

  const identical = cal({ B: { x: 100, y: 100 }, S: { x: 100, y: 100 }, G: { x: 100, y: 100 } }, idA)
  const ident = assessCalibration(identical, video)
  cases.push({
    name: 'identical B/S/G blocked',
    passed: !ident.ok && ident.issues.includes('identical_marks'),
    detail: ident.message,
  })

  const oob = cal({ B: { x: -4, y: 10 }, S: { x: 20, y: 40 }, G: { x: 80, y: 30 } }, idA)
  const oobA = assessCalibration(oob, video)
  cases.push({
    name: 'out of bounds blocked',
    passed: !oobA.ok && oobA.issues.includes('out_of_bounds'),
    detail: oobA.message,
  })

  const tiny = cal({ B: { x: 100, y: 100 }, S: { x: 104, y: 101 }, G: { x: 102, y: 103 } }, idA)
  const deg = assessCalibration(tiny, video)
  cases.push({
    name: 'degenerate triangle blocked',
    passed: !deg.ok && (deg.issues.includes('degenerate') || deg.issues.includes('identical_marks')),
    detail: deg.message,
  })

  const mismatch = assessCalibration(fixture, { ...video, source: 'camera', deviceId: 'cam-1' })
  cases.push({
    name: 'camera change invalidates old cal',
    passed: !mismatch.ok && mismatch.issues.includes('source_mismatch'),
    detail: mismatch.message,
  })

  const empty = assessCalibration(emptyCalibration(), video)
  cases.push({
    name: 'empty marks not ready',
    passed: !empty.ok && empty.issues.includes('missing_marks'),
    detail: empty.message,
  })

  cases.push({
    name: 'no video blocks ready',
    passed: !assessCalibration(fixture, null).ok,
    detail: 'null video',
  })

  const live = poseFreshness(1000, 1100)
  const stale = poseFreshness(1000, 1000 + POSE_STALE_MS + 10)
  const lost = poseFreshness(1000, 1000 + POSE_LOST_MS + 10)
  cases.push({
    name: 'pose freshness live / stale / lost',
    passed: live.status === 'live' && stale.status === 'stale' && lost.status === 'lost',
    detail: `${live.status}/${stale.status}/${lost.status}`,
  })
  cases.push({
    name: 'body readiness requires live pose',
    passed:
      poseIsReady(live, { timestampMs: 1100, videoWidth: 8, videoHeight: 8, landmarks: [{ x: 0, y: 0, z: 0, visibility: 1 }], engine: 'synthetic' }) &&
      !poseIsReady(lost, { timestampMs: 1000, videoWidth: 8, videoHeight: 8, landmarks: [{ x: 0, y: 0, z: 0, visibility: 1 }], engine: 'synthetic' }),
    detail: 'live ok, lost fails',
  })

  cases.push({
    name: 'stale worker session discarded',
    passed: acceptSessionReply(4, 3) === false && acceptSessionReply(4, 4) === true && acceptSessionReply(4, undefined) === false,
    detail: 'generation guard',
  })

  cases.push({
    name: 'playable requires size + readyState',
    passed:
      isVideoPlayable({ readyState: 2, videoWidth: 1280, videoHeight: 720 }) &&
      !isVideoPlayable({ readyState: 2, videoWidth: 0, videoHeight: 0 }) &&
      !isVideoPlayable({ readyState: 0, videoWidth: 1280, videoHeight: 720 }),
    detail: 'HAVE_CURRENT_DATA + 2px',
  })

  const failed = cases.filter((c) => !c.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `SETUP_HARNESS_OK — ${cases.length} checks.`
        : `SETUP_HARNESS_FAIL — ${failed.map((c) => c.name).join(', ')}`,
  }
}
