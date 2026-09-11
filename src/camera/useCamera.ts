import { useState } from 'react'
import type { CameraStatus } from '../types/camera.ts'

const IDLE: CameraStatus = {
  permission: 'idle',
  source: 'camera',
  deviceId: null,
  devices: [],
  error: null,
  usingMicrophone: false,
}

export function useCamera(): {
  status: CameraStatus
  stream: MediaStream | null
  start: (deviceId?: string) => Promise<void>
  stop: () => void
} {
  const [status] = useState<CameraStatus>(IDLE)
  return {
    status,
    stream: null,
    start: async () => {
      /* camera strand */
    },
    stop: () => {
      /* camera strand */
    },
  }
}
