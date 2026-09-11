import type { PixelPoint } from './calibration.ts'

export type PedalTrackStatus = 'idle' | 'seeding' | 'locked' | 'lost'

export type PedalSample = {
  timestampMs: number
  pixel: PixelPoint | null
  crankAngleDeg: number | null
  phase01: number | null
  revolutions: number
  status: PedalTrackStatus
  lostFrames: number
}

export type PedalTrackerOptions = {
  minAreaPx: number
  maxLostFrames: number
}
