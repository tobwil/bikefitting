import type { PedalSample, PedalTrackerOptions } from '../types/pedal.ts'

const DEFAULTS: PedalTrackerOptions = {
  minAreaPx: 12,
  maxLostFrames: 12,
}

export function createPedalTracker(_options?: Partial<PedalTrackerOptions>) {
  void DEFAULTS
  return {
    seed(_x: number, _y: number) {},
    update(_frame: ImageData, _timestampMs: number): PedalSample {
      return {
        timestampMs: 0,
        pixel: null,
        crankAngleDeg: null,
        phase01: null,
        revolutions: 0,
        status: 'idle',
        lostFrames: 0,
      }
    },
    reset() {},
  }
}
