import { isContinuityCameraLabel } from '../camera/deviceLabel.ts'
import { LAST_CAMERA_STORAGE_KEY } from './constants.ts'

export type CameraKind = 'continuity' | 'mac_webcam' | 'other'

export type LastSuccessfulCamera = {
  deviceId: string
  label: string
  kind: CameraKind
  savedAt: string
}

export function isMacWebcamLabel(label: string): boolean {
  const lower = label.toLowerCase()
  if (isContinuityCameraLabel(label)) return false
  return (
    lower.includes('facetime') ||
    lower.includes('built-in') ||
    lower.includes('integriert') ||
    lower.includes('macbook') ||
    lower.includes('imac') ||
    lower.includes('studio display') ||
    /\bmac\b/.test(lower)
  )
}

export function classifyCameraKind(label: string): CameraKind {
  if (isContinuityCameraLabel(label)) return 'continuity'
  if (isMacWebcamLabel(label)) return 'mac_webcam'
  return 'other'
}

export function pickPreferredDevice(input: {
  devices: { deviceId: string; label: string }[]
  lastSuccessfulId: string | null
}): { deviceId: string | null; reason: 'last_successful' | 'continuity' | 'none' } {
  const last = input.lastSuccessfulId
    ? input.devices.find((device) => device.deviceId === input.lastSuccessfulId)
    : undefined
  if (last) return { deviceId: last.deviceId, reason: 'last_successful' }
  const continuity = input.devices.find((device) => classifyCameraKind(device.label) === 'continuity')
  if (continuity) return { deviceId: continuity.deviceId, reason: 'continuity' }
  return { deviceId: null, reason: 'none' }
}

export function hasContinuityCamera(devices: { label: string }[]): boolean {
  return devices.some((device) => classifyCameraKind(device.label) === 'continuity')
}

/**
 * Live capture may switch to iPhone without a prompt.
 * Switching that live capture to a Mac webcam always needs confirmation.
 */
export function shouldConfirmSwitch(input: {
  liveDeviceId: string | null
  liveKind: CameraKind | null
  liveActive: boolean
  nextDeviceId: string
  nextKind: CameraKind
}): boolean {
  if (!input.liveActive) return false
  if (!input.liveDeviceId) return false
  if (input.liveDeviceId === input.nextDeviceId) return false
  return input.nextKind === 'mac_webcam'
}

export type CameraStartPolicy =
  | { action: 'start'; deviceId: string | undefined; reason: 'last_successful' | 'continuity' | 'permission' }
  | { action: 'show_continuity_help' }

export function initialCameraPolicy(input: {
  devices: { deviceId: string; label: string }[]
  lastSuccessful: LastSuccessfulCamera | null
  permissionGranted: boolean
}): CameraStartPolicy {
  const preferred = pickPreferredDevice({
    devices: input.devices,
    lastSuccessfulId: input.lastSuccessful?.deviceId ?? null,
  })
  if (preferred.deviceId && preferred.reason !== 'none') {
    return { action: 'start', deviceId: preferred.deviceId, reason: preferred.reason }
  }
  if (input.lastSuccessful && classifyCameraKind(input.lastSuccessful.label) === 'mac_webcam') {
    const still = input.devices.find((device) => device.deviceId === input.lastSuccessful?.deviceId)
    if (still) return { action: 'start', deviceId: still.deviceId, reason: 'last_successful' }
  }
  if (!input.permissionGranted) {
    return { action: 'start', deviceId: undefined, reason: 'permission' }
  }
  return { action: 'show_continuity_help' }
}

export function readLastSuccessfulCamera(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): LastSuccessfulCamera | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LAST_CAMERA_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LastSuccessfulCamera
    if (!parsed?.deviceId) return null
    return parsed
  } catch {
    return null
  }
}

export function writeLastSuccessfulCamera(
  value: LastSuccessfulCamera,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  if (!storage) return
  try {
    storage.setItem(LAST_CAMERA_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* quota / private mode */
  }
}
