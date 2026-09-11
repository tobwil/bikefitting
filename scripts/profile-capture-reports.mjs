/**
 * One-off VM profile of the recording-path report materializations.
 * Simulates FitSession: capture.snapshot() → capture.push() → capture.snapshot().
 * push() itself also used to snapshot internally (maybeFreeze + return snapshot).
 */
import { createMeasurementCapture } from '../src/metrics/capture.ts'
import { computePixelBikeTransform } from '../src/calibration/transform.ts'
import {
  SYNTHETIC_MARKS,
  syntheticCrankAngleDeg,
  syntheticPedalPixel,
} from '../src/camera/synthetic.ts'
import { syntheticPoseFrame } from '../src/pose/syntheticLandmarks.ts'
import {
  metricsReportComputeCount,
  resetMetricsReportComputeCount,
} from '../src/metrics/pipeline.ts'

const FPS = 30
const DT_MS = 1000 / FPS
const RPM = 80
const MS_PER_REV = (60 / RPM) * 1000
const TRANSFORM = computePixelBikeTransform({
  B: { ...SYNTHETIC_MARKS.B },
  S: { ...SYNTHETIC_MARKS.S },
  G: { ...SYNTHETIC_MARKS.G },
})

function collectFrames(revs) {
  const frames = []
  const durationMs = revs * MS_PER_REV + DT_MS
  for (let t = 0; t <= durationMs; t += DT_MS) {
    const timestampMs = 4000 + t
    const angle = syntheticCrankAngleDeg(timestampMs)
    frames.push({
      timestampMs,
      pose: syntheticPoseFrame(timestampMs),
      pedal: {
        timestampMs,
        pixel: syntheticPedalPixel(timestampMs),
        crankAngleDeg: angle,
        phase01: angle / 360,
        revolutions: Math.floor(timestampMs / MS_PER_REV),
        status: 'locked',
        lostFrames: 0,
      },
      transform: TRANSFORM,
    })
  }
  return frames
}

const frames = collectFrames(8)
const cap = createMeasurementCapture({
  targetRevs: 20,
  countdownSeconds: 1,
  now: () => 1000,
})
cap.startCountdown(0)
cap.tick(1000)

resetMetricsReportComputeCount()
const t0 = performance.now()
for (const frame of frames) {
  cap.snapshot()
  cap.push(frame)
  cap.snapshot()
}
const elapsedMs = performance.now() - t0
const computes = metricsReportComputeCount()
const perFrame = computes / frames.length

console.log(
  JSON.stringify(
    {
      frames: frames.length,
      reportComputes: computes,
      computesPerFrame: Number(perFrame.toFixed(2)),
      elapsedMs: Number(elapsedMs.toFixed(2)),
      lastRevs: cap.snapshot().report.validRevolutions,
    },
    null,
    2,
  ),
)
