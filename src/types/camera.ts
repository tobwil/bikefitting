export type CameraPermission =
  | 'idle'
  | 'prompting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'stopped'
  | 'error'

export type CameraDevice = {
  deviceId: string
  label: string
}

export type VideoSourceKind = 'camera' | 'synthetic'

export type CameraStatus = {
  permission: CameraPermission
  source: VideoSourceKind
  deviceId: string | null
  devices: CameraDevice[]
  error: string | null
  usingMicrophone: false
}

export type CameraStartRequest = {
  deviceId?: string
  audio: false
}
