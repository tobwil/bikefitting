import type { ActionLensStatus } from '../types/action.ts'
import type { CaptureAsset, CaptureType } from '../types/capture.ts'
import type { ObservationReport } from '../types/observation.ts'
import type { MeasurementResult } from '../types/result.ts'
import type {
  CaptureSetupFingerprint,
  ChangeIncompatibilityReason,
} from '../types/change.ts'
import type { CameraKind, LastSuccessfulCamera } from '../capture/preferredCamera.ts'
import { classifyCameraKind } from '../capture/preferredCamera.ts'

export function emptySetup(): CaptureSetupFingerprint {
  return {
    deviceId: null,
    cameraKind: null,
    captureType: null,
    width: null,
    height: null,
    geometryRevision: null,
    setupId: null,
    lensStatus: 'unknown',
    userReportedLens: null,
  }
}

function cameraKindFromCaptureType(type: CaptureType | null): CameraKind | null {
  if (type === 'continuity') return 'continuity'
  if (type === 'webcam') return 'mac_webcam'
  return null
}

export function setupFromSources(input: {
  asset?: Pick<CaptureAsset, 'captureType' | 'width' | 'height'> | null
  observation?: Pick<ObservationReport, 'geometryRevision'> | null
  result?: MeasurementResult | null
  camera?: LastSuccessfulCamera | null
  captureType?: CaptureType | null
}): CaptureSetupFingerprint {
  const file = input.result?.file
  const binding = input.result?.calibration.binding
  const captureType = input.asset?.captureType ?? input.captureType ?? null
  const camera = input.camera
  return {
    deviceId: camera?.deviceId ?? null,
    cameraKind: camera?.kind ?? cameraKindFromCaptureType(captureType),
    captureType,
    width: input.asset?.width ?? file?.width ?? null,
    height: input.asset?.height ?? file?.height ?? null,
    geometryRevision: input.observation?.geometryRevision ?? input.result?.observation?.geometryRevision ?? null,
    setupId: binding?.setupId ?? null,
    lensStatus: 'unknown',
    userReportedLens: null,
  }
}

function setIfBoth<T>(a: T | null, b: T | null, equal: (x: T, y: T) => boolean): boolean {
  if (a == null || b == null) return true
  return equal(a, b)
}

export function diffSetup(
  before: CaptureSetupFingerprint,
  after: CaptureSetupFingerprint,
): { camera: boolean; lens: boolean; setup: boolean; reasons: ChangeIncompatibilityReason[] } {
  const reasons: ChangeIncompatibilityReason[] = []
  const cameraIdOk = setIfBoth(before.deviceId, after.deviceId, (a, b) => a === b)
  const kindOk = setIfBoth(before.cameraKind, after.cameraKind, (a, b) => a === b)
  const typeOk = setIfBoth(before.captureType, after.captureType, (a, b) => a === b)
  const widthOk = setIfBoth(before.width, after.width, (a, b) => a === b)
  const heightOk = setIfBoth(before.height, after.height, (a, b) => a === b)
  const camera = cameraIdOk && kindOk && typeOk && widthOk && heightOk
  if (!camera) reasons.push('camera_changed')

  const geometryRevOk = setIfBoth(before.geometryRevision, after.geometryRevision, (a, b) => a === b)
  const setupIdOk = setIfBoth(before.setupId, after.setupId, (a, b) => a === b)
  if (!geometryRevOk || !setupIdOk) reasons.push('geometry_changed')

  const lensStatusOk = setIfBoth(before.lensStatus, after.lensStatus, (a, b) => a === b)
  const reportedOk = setIfBoth(before.userReportedLens, after.userReportedLens, (a, b) => a === b)
  const lensUnchanged =
    (before.lensStatus === 'unknown' && after.lensStatus === 'unknown' && !before.userReportedLens && !after.userReportedLens) ||
    (lensStatusOk && reportedOk && before.lensStatus === after.lensStatus)
  const lens = lensUnchanged && reportedOk
  if (!lens) reasons.push('lens_changed')

  const setup = camera && lens && geometryRevOk && setupIdOk
  return { camera, lens, setup, reasons: [...new Set(reasons)] }
}

export function preferredDeviceId(setup: CaptureSetupFingerprint): string | undefined {
  return setup.deviceId ?? undefined
}

export function cameraKindLabel(kind: CameraKind | string | null): string {
  if (kind === 'continuity') return 'iPhone / Continuity'
  if (kind === 'mac_webcam') return 'Mac-Kamera'
  return classifyCameraKind(kind ?? '') === 'other' ? 'Kamera' : 'Kamera'
}

export function lensStatusOf(_value?: ActionLensStatus | null): ActionLensStatus {
  return _value ?? 'unknown'
}
