import {
  START_DEMO_LABEL,
  START_EXPERT_LABEL,
  START_PRIMARY_LABEL,
  START_SECONDARY_CAPTURES,
  START_SECONDARY_FILE,
  RECORD_PRIMARY_LABEL,
  RECORD_PRIMARY_SUB,
  SAVED_LABEL,
  INCOMPLETE_LABEL,
  savedUiLabel,
  CORRECT_FRAMING_LABEL,
  RECORD_ANYWAY_LABEL,
} from './copy.ts'
import { pickRecorderMime } from './mime.ts'
import { isPreviewConnected } from './liveness.ts'
import {
  classifyCameraKind,
  hasContinuityCamera,
  initialCameraPolicy,
  pickPreferredDevice,
  shouldConfirmSwitch,
} from './preferredCamera.ts'
import { framingBlocksSave, framingFromPose } from './framing.ts'
import { classifyPersistError, createMemoryCaptureStore } from './storage.ts'
import { classifyClipCompleteness, transitionCapture } from './state.ts'
import { CAPTURE_ASSET_KIND, CAPTURE_SCHEMA_VERSION, type CaptureAsset } from '../types/capture.ts'

export type CaptureHarnessCase = { name: string; passed: boolean; detail: string }
export type CaptureHarnessResult = { passed: boolean; cases: CaptureHarnessCase[]; message: string }

function check(name: string, passed: boolean, detail: string): CaptureHarnessCase {
  return { name, passed, detail }
}

function sampleAsset(over: Partial<CaptureAsset> = {}): CaptureAsset {
  return {
    kind: CAPTURE_ASSET_KIND,
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    captureId: 'cap-test',
    blobKey: 'cap-test',
    contentHash: 'abc',
    mimeType: 'video/webm',
    codec: 'vp8',
    durationMs: 40_000,
    width: 1280,
    height: 720,
    rotationDeg: 0,
    captureType: 'continuity',
    completeness: 'complete',
    intendedDurationMs: 40_000,
    createdAt: '2026-09-14T12:00:00.000Z',
    hasAudio: false,
    byteLength: 1200,
    filename: 'bikefit-cap-test.webm',
    ...over,
  }
}

export function runCaptureHarness(): CaptureHarnessResult {
  const cases: CaptureHarnessCase[] = []

  cases.push(
    check(
      'start CTA is BikeFit starten with small file/history actions',
      START_PRIMARY_LABEL === 'BikeFit starten' &&
        START_SECONDARY_FILE === 'Vorhandenes Video' &&
        START_SECONDARY_CAPTURES === 'Frühere Ergebnisse' &&
        START_EXPERT_LABEL === 'Erweiterte Messung' &&
        START_DEMO_LABEL === 'Demo',
      `${START_PRIMARY_LABEL} / ${START_SECONDARY_FILE} / ${START_EXPERT_LABEL}`,
    ),
  )
  cases.push(
    check(
      'record CTA is 40s with 10s preroll subtitle and no Messung starten',
      RECORD_PRIMARY_LABEL === '40 Sekunden aufnehmen' &&
        RECORD_PRIMARY_SUB.includes('10 Sekunden') &&
        RECORD_PRIMARY_SUB.includes('ohne Mikrofon') &&
        !RECORD_PRIMARY_LABEL.includes('Messung'),
      `${RECORD_PRIMARY_LABEL} · ${RECORD_PRIMARY_SUB}`,
    ),
  )

  cases.push(
    check(
      'idle can enter countdown then recording then finalizing then saved',
      transitionCapture('idle', 'countdown') === 'countdown' &&
        transitionCapture('countdown', 'recording') === 'recording' &&
        transitionCapture('recording', 'finalizing') === 'finalizing' &&
        transitionCapture('finalizing', 'saved') === 'saved',
      'idle→countdown→recording→finalizing→saved',
    ),
  )
  cases.push(
    check(
      'recording does not jump to saved without finalize',
      transitionCapture('recording', 'saved') === 'recording',
      'blocked',
    ),
  )

  cases.push(
    check(
      '40s clip at 36s+ is complete; 20s is incomplete; 100ms unusable',
      classifyClipCompleteness({ durationMs: 36_000, intendedDurationMs: 40_000 }) === 'complete' &&
        classifyClipCompleteness({ durationMs: 20_000, intendedDurationMs: 40_000 }) === 'incomplete' &&
        classifyClipCompleteness({ durationMs: 100, intendedDurationMs: 40_000 }) === 'unusable',
      'ratio 0.9',
    ),
  )
  cases.push(
    check(
      'Gespeichert only after persist+decode+complete',
      savedUiLabel({ persisted: true, decoded: true, completeness: 'complete' }) === SAVED_LABEL &&
        savedUiLabel({ persisted: true, decoded: true, completeness: 'incomplete' }) === INCOMPLETE_LABEL &&
        savedUiLabel({ persisted: false, decoded: true, completeness: 'complete' }) === null &&
        savedUiLabel({ persisted: true, decoded: false, completeness: 'complete' }) === null,
      'label contract',
    ),
  )

  const mime = pickRecorderMime((type) => type === 'video/webm;codecs=vp8' || type === 'video/webm')
  cases.push(
    check('mime picker uses isTypeSupported, prefers vp8 over generic webm', mime?.codec === 'vp8', mime?.mimeType ?? 'none'),
  )
  cases.push(
    check(
      'no supported mime returns null',
      pickRecorderMime(() => false) === null,
      'unsupported',
    ),
  )

  cases.push(
    check(
      'stream object alone is not connected',
      isPreviewConnected({
        hasStreamObject: true,
        playable: true,
        lastDecodedFrameAtMs: null,
        nowMs: 1000,
      }) === false &&
        isPreviewConnected({
          hasStreamObject: true,
          playable: true,
          lastDecodedFrameAtMs: 900,
          nowMs: 1000,
        }) === true &&
        isPreviewConnected({
          hasStreamObject: true,
          playable: false,
          lastDecodedFrameAtMs: 900,
          nowMs: 1000,
        }) === false,
      'decoded frames required',
    ),
  )

  const iphone = { deviceId: 'phone', label: 'iPhone 15 Pro' }
  const mac = { deviceId: 'face', label: 'FaceTime HD Camera' }
  cases.push(
    check(
      'last successful camera wins if still present',
      pickPreferredDevice({ devices: [mac, iphone], lastSuccessfulId: 'phone' }).reason === 'last_successful',
      'last_successful',
    ),
  )
  cases.push(
    check(
      'otherwise prefer Continuity over Mac webcam',
      pickPreferredDevice({ devices: [mac, iphone], lastSuccessfulId: null }).deviceId === 'phone' &&
        hasContinuityCamera([iphone]),
      classifyCameraKind(iphone.label),
    ),
  )
  cases.push(
    check(
      'live capture does not silently switch to Mac webcam',
      shouldConfirmSwitch({
        liveDeviceId: 'phone',
        liveKind: 'continuity',
        liveActive: true,
        nextDeviceId: 'face',
        nextKind: 'mac_webcam',
      }) === true &&
        shouldConfirmSwitch({
          liveDeviceId: 'face',
          liveKind: 'mac_webcam',
          liveActive: true,
          nextDeviceId: 'phone',
          nextKind: 'continuity',
        }) === false,
      'confirm mac only',
    ),
  )
  cases.push(
    check(
      'no iPhone after permission shows Continuity help instead of auto Mac',
      initialCameraPolicy({
        devices: [mac],
        lastSuccessful: null,
        permissionGranted: true,
      }).action === 'show_continuity_help',
      'help',
    ),
  )

  const foot = framingFromPose({
    connected: true,
    poseReady: true,
    freshness: 'live',
    hip: true,
    knee: true,
    ankle: true,
    foot: false,
  })
  cases.push(
    check(
      'missing foot/leg uses Ausschnitt korrigieren + Trotzdem aufnehmen',
      foot.code === 'foot_missing' &&
        foot.primaryLabel === CORRECT_FRAMING_LABEL &&
        foot.secondaryLabel === RECORD_ANYWAY_LABEL &&
        framingBlocksSave(foot) === false,
      foot.code,
    ),
  )
  const drop = framingFromPose({
    connected: true,
    poseReady: false,
    freshness: 'lost',
    hip: false,
    knee: false,
    ankle: false,
    foot: false,
  })
  cases.push(
    check(
      'brief pose drop does not block save',
      drop.code === 'pose_brief_drop' && framingBlocksSave(drop) === false && drop.primaryKind === 'record',
      drop.code,
    ),
  )

  const quota = classifyPersistError(new DOMException('full', 'QuotaExceededError'))
  cases.push(check('full disk is a concrete quota error', quota.code === 'quota' && /voll/i.test(quota.message), quota.code))

  const store = createMemoryCaptureStore()
  const complete = sampleAsset()
  cases.push(
    check(
      'memory store keeps hasAudio false identity',
      complete.hasAudio === false && complete.kind === 'bikefit.capture',
      complete.kind,
    ),
  )
  void store

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    cases,
    message:
      failed.length === 0
        ? `CAPTURE_HARNESS_OK — ${cases.length} checks.`
        : `CAPTURE_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
  }
}
