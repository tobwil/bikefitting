import { makeSetupId } from '../camera/setupId.ts'
import { tryApplyCameraZoom } from '../camera/zoom.ts'
import { zoomSettingDrifted } from '../camera/zoomDrift.ts'
import { cornerLumaSignature, cornerSignaturesDiffer } from '../camera/sceneChange.ts'
import { assessCalibration } from '../calibration/validity.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import type { BikeCalibration } from '../types/calibration.ts'
import { flowCalibrateReady } from './calibrateReady.ts'
import { flowFeedback } from './feedback.ts'
import { retryKindForFeedback } from './retryAction.ts'
import type { DetectSession } from '../calibration/propose.ts'

export type Ap01HarnessCase = { name: string; passed: boolean; detail: string }
export type Ap01HarnessResult = { passed: boolean; cases: Ap01HarnessCase[]; message: string }

const VIDEO = { source: 'camera' as const, deviceId: 'cam', width: 1280, height: 720 }

function check(name: string, passed: boolean, detail: string): Ap01HarnessCase {
  return { name, passed, detail }
}

function fixtureCal(setupId: string): BikeCalibration {
  const now = '2026-09-14T12:00:00.000Z'
  const marks = { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } }
  return {
    version: 1,
    marks,
    transform: computePixelBikeTransform(marks),
    createdAt: now,
    updatedAt: now,
    binding: { source: 'camera', deviceId: 'cam', width: 1280, height: 720, setupId },
    imageGeneration: 1,
  }
}

const GRANTED = {
  permission: 'granted' as const,
  source: 'camera' as const,
  deviceId: 'cam',
  devices: [],
  error: null,
  usingMicrophone: false as const,
}

function mountReady(opts: {
  assessmentOk: boolean
  appliedGeneration?: number
  detectPhase?: DetectSession['phase']
  detectGeneration?: number
}) {
  return flowCalibrateReady({
    calibration: {
      assessment: { ok: opts.assessmentOk },
      data: { imageGeneration: opts.appliedGeneration ?? 1 },
      detect: { phase: opts.detectPhase ?? 'applied', imageGeneration: opts.detectGeneration ?? 1 },
    },
  })
}

export async function runAp01Harness(): Promise<Ap01HarnessResult> {
  const cases: Ap01HarnessCase[] = []

  const poseFb = flowFeedback({
    step: 'body',
    camera: GRANTED,
    personVisible: false,
    pedalStatus: 'idle',
    workerError: 'Pose-Graph ist defekt. Neu starten.',
  })
  cases.push(
    check(
      'AP-01 pose error retry names pose restart, not camera',
      poseFb.id === 'pose-error' &&
        retryKindForFeedback(poseFb) === 'pose' &&
        poseFb.retryLabel === 'Personenerkennung neu starten',
      `${poseFb.id} kind=${retryKindForFeedback(poseFb)} label=${poseFb.retryLabel}`,
    ),
  )

  const camFb = flowFeedback({
    step: 'camera',
    camera: { ...GRANTED, permission: 'error', error: 'Kamera getrennt' },
    personVisible: false,
    pedalStatus: 'idle',
    workerError: null,
  })
  cases.push(
    check(
      'AP-01 camera error retry reconnects camera',
      camFb.id === 'camera-error' &&
        retryKindForFeedback(camFb) === 'camera' &&
        camFb.retryLabel === 'Kamera neu verbinden',
      `${camFb.id} kind=${retryKindForFeedback(camFb)}`,
    ),
  )

  const pedalFb = flowFeedback({
    step: 'body',
    camera: GRANTED,
    personVisible: true,
    pedalStatus: 'lost',
    workerError: null,
  })
  cases.push(
    check(
      'AP-01 lost marker retry reselects pedal, not camera',
      pedalFb.id === 'pick-pedal' &&
        retryKindForFeedback(pedalFb) === 'pedal' &&
        pedalFb.retryLabel === 'Pedalmarker neu wählen',
      `${pedalFb.id} kind=${retryKindForFeedback(pedalFb)} label=${pedalFb.retryLabel}`,
    ),
  )

  const id0 = makeSetupId({ ...VIDEO, geometryRevision: 0 })
  const id1 = makeSetupId({ ...VIDEO, geometryRevision: 1 })
  const cal = fixtureCal(id0)
  const sameResZoomed = assessCalibration(cal, { ...VIDEO, geometryRevision: 1 })
  const afterZoomReady = mountReady({
    assessmentOk: sameResZoomed.ok,
    appliedGeneration: 1,
    detectPhase: 'applied',
    detectGeneration: 1,
  })
  cases.push(
    check(
      'AP-01 mounted: same-resolution zoom revises setup id and blocks measure',
      id0 !== id1 &&
        !id0.includes(':r') &&
        id1.endsWith(':r1') &&
        sameResZoomed.ok === false &&
        sameResZoomed.issues.includes('source_mismatch') &&
        afterZoomReady === false,
      `id0=${id0} id1=${id1} issues=${sameResZoomed.issues.join(',')} ready=${afterZoomReady}`,
    ),
  )

  const restored = assessCalibration(cal, { ...VIDEO, geometryRevision: 0 })
  cases.push(
    check(
      'AP-01 stored result at revision 0 stays readable after later zoom id exists',
      restored.ok === true && makeSetupId({ ...VIDEO, geometryRevision: 2 }) !== id0,
      `rev0=${restored.ok}`,
    ),
  )

  let liveZoom = 1
  const track = {
    getCapabilities: () => ({ zoom: { min: 0.5, max: 2, step: 0.1 } }),
    getSettings: () => ({ zoom: liveZoom }),
    applyConstraints: async (constraints: { advanced: Array<{ zoom: number }> }) => {
      liveZoom = constraints.advanced[0]!.zoom
    },
  } as unknown as MediaStreamTrack
  const unconfirmedTrack = {
    getCapabilities: () => ({ zoom: { min: 0.5, max: 2, step: 0.1 } }),
    getSettings: () => ({ zoom: 1 }),
    applyConstraints: async () => {},
  } as unknown as MediaStreamTrack
  cases.push(
    check(
      'AP-01 rejected zoom does not claim a geometry change',
      (await tryApplyCameraZoom(track, 9)).geometryChanged === false,
      'out of range',
    ),
  )
  const unconfirmed = await tryApplyCameraZoom(unconfirmedTrack, 0.5)
  cases.push(
    check(
      'AP-01 partial/unconfirmed zoom still invalidates geometry',
      unconfirmed.status === 'unconfirmed' && unconfirmed.geometryChanged === true,
      `status=${unconfirmed.status} changed=${unconfirmed.geometryChanged}`,
    ),
  )
  cases.push(
    check(
      'AP-01 external zoom drift is detectable without inventing 0.5x metadata',
      zoomSettingDrifted(track, 0.5) === true && zoomSettingDrifted(track, liveZoom) === false,
      `liveZoom=${liveZoom}`,
    ),
  )

  const pixels = new Uint8ClampedArray(16 * 16 * 4)
  pixels.fill(40)
  const dark = { width: 16, height: 16, data: pixels } as ImageData
  const brightPx = new Uint8ClampedArray(pixels)
  for (let i = 0; i < 32; i += 1) brightPx[i] = 220
  const bright = { width: 16, height: 16, data: brightPx } as ImageData
  cases.push(
    check(
      'AP-01 corner signature ignores identical frames and flags a lighting/crop jump',
      !cornerSignaturesDiffer(cornerLumaSignature(dark), cornerLumaSignature(dark)) &&
        cornerSignaturesDiffer(cornerLumaSignature(dark), cornerLumaSignature(bright)),
      'scene helper',
    ),
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `AP01_OK — ${cases.length} checks.`
        : `AP01_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
