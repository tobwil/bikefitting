import type { PixelPoint } from '../types/calibration.ts'
import type { PedalSample, PedalTrackerOptions } from '../types/pedal.ts'
import { crankAngleDeg, phase01FromAngle, unwrapDeltaDeg } from './geometry.ts'

const DEFAULTS: PedalTrackerOptions = {
  minAreaPx: 12,
  maxLostFrames: 12,
}

const SEARCH_R = 80
const COLOR_MAX = 95

export type PedalTracker = {
  seed(x: number, y: number): void
  setBottomBracket(point: PixelPoint | null): void
  update(frame: ImageData, timestampMs: number): PedalSample
  reset(): void
  /** Keep the spatial seed; drop unwrap / revolution accumulators (seek / restart). */
  resetTemporal(): void
}

type SeedColor = { r: number; g: number; b: number }

function sampleColor(frame: ImageData, x: number, y: number): SeedColor | null {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix < 0 || iy < 0 || ix >= frame.width || iy >= frame.height) return null
  const i = (iy * frame.width + ix) * 4
  return { r: frame.data[i], g: frame.data[i + 1], b: frame.data[i + 2] }
}

function colorDist(a: SeedColor, r: number, g: number, b: number): number {
  return Math.hypot(a.r - r, a.g - g, a.b - b)
}

function findBlob(
  frame: ImageData,
  color: SeedColor,
  around: PixelPoint,
): { pixel: PixelPoint; area: number } | null {
  const x0 = Math.max(0, Math.floor(around.x - SEARCH_R))
  const y0 = Math.max(0, Math.floor(around.y - SEARCH_R))
  const x1 = Math.min(frame.width - 1, Math.ceil(around.x + SEARCH_R))
  const y1 = Math.min(frame.height - 1, Math.ceil(around.y + SEARCH_R))
  let sx = 0
  let sy = 0
  let n = 0
  const { data, width } = frame
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4
      if (colorDist(color, data[i], data[i + 1], data[i + 2]) <= COLOR_MAX) {
        sx += x
        sy += y
        n += 1
      }
    }
  }
  if (n === 0) return null
  return { pixel: { x: sx / n, y: sy / n }, area: n }
}

function emptySample(timestampMs: number, status: PedalSample['status'], lostFrames: number): PedalSample {
  return {
    timestampMs,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status,
    lostFrames,
  }
}

export function createPedalTracker(options?: Partial<PedalTrackerOptions>): PedalTracker {
  const opts = { ...DEFAULTS, ...options }
  let color: SeedColor | null = null
  let last: PixelPoint | null = null
  let origin: PixelPoint | null = null
  let prevAngle: number | null = null
  let traveled = 0
  let lostFrames = 0
  let status: PedalSample['status'] = 'idle'

  const reading = (timestampMs: number, pixel: PixelPoint | null): PedalSample => {
    let angle: number | null = null
    let phase: number | null = null
    if (pixel && origin) {
      angle = crankAngleDeg(pixel, origin)
      phase = phase01FromAngle(angle)
      if (prevAngle !== null) traveled += unwrapDeltaDeg(prevAngle, angle)
      prevAngle = angle
    }
    return {
      timestampMs,
      pixel,
      crankAngleDeg: angle,
      phase01: phase,
      revolutions: Math.floor(Math.abs(traveled) / 360),
      status,
      lostFrames,
    }
  }

  return {
    seed(x: number, y: number) {
      last = { x, y }
      color = null
      status = 'seeding'
      lostFrames = 0
    },
    setBottomBracket(point: PixelPoint | null) {
      origin = point
    },
    update(frame: ImageData, timestampMs: number): PedalSample {
      if (!last && !color) return emptySample(timestampMs, 'idle', 0)
      if (!color && last) {
        color = sampleColor(frame, last.x, last.y)
        if (!color) return emptySample(timestampMs, 'seeding', 0)
      }
      if (!color || !last) return emptySample(timestampMs, status, lostFrames)

      const blob = findBlob(frame, color, last)
      if (!blob || blob.area < opts.minAreaPx) {
        lostFrames += 1
        if (lostFrames > opts.maxLostFrames) {
          status = 'lost'
          prevAngle = null
        } else if (status !== 'lost') {
          status = status === 'idle' ? 'seeding' : status
        }
        return reading(timestampMs, null)
      }

      last = blob.pixel
      lostFrames = 0
      status = 'locked'
      return reading(timestampMs, blob.pixel)
    },
    reset() {
      color = null
      last = null
      prevAngle = null
      traveled = 0
      lostFrames = 0
      status = 'idle'
    },
    resetTemporal() {
      prevAngle = null
      traveled = 0
      lostFrames = 0
    },
  }
}

/** Scan a frame for the magenta harness / fixture marker and return its centroid. */
export function findMagentaMarker(frame: ImageData): PixelPoint | null {
  const { data, width, height } = frame
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      if (r > 180 && b > 150 && g < 90) {
        sx += x
        sy += y
        n += 1
      }
    }
  }
  if (n < 4) return null
  return { x: sx / n, y: sy / n }
}
