import type { BikeCalibration } from '../types/calibration.ts'
import type { CameraNearSide } from '../types/landmarks.ts'
import type { MetricMethod, MetricsFrame } from '../types/metrics.ts'
import type { ResultSource } from '../types/result.ts'
import { PHASE_WINDOW_HALF_DEG, type PhaseEvidence, type PhaseId, type PhaseImage } from '../types/phase.ts'
import { crossedTdc, pedalAngleDeg } from './cycles.ts'
import {
  buildPhaseEvidence,
  crankDistanceDeg,
  nearestPhaseId,
  phaseWantsImage,
  type PhaseFrameInput,
} from './phaseFrames.ts'

export type PhaseCapture = {
  reset(): void
  push(frame: MetricsFrame, image?: PhaseImage | null): void
  wantsImage(angleDeg: number | null): boolean
  /** True when this frame is the closest in-window sample so far in the open crank rev. */
  shouldEncode(angleDeg: number | null): boolean
  freeze(input: {
    calibration: BikeCalibration
    side: CameraNearSide
    source: ResultSource
    metricMethod: MetricMethod
    capturedAt?: string
  }): PhaseEvidence
  snapshot(): PhaseFrameInput[]
}

/**
 * Collects recording frames and optional stills. Freeze selects the
 * representative cycle from crank-phase measurement — not from live video later.
 */
export function createPhaseCapture(windowHalfDeg = PHASE_WINDOW_HALF_DEG): PhaseCapture {
  const frames: PhaseFrameInput[] = []
  const cycleBest = new Map<PhaseId, number>()
  let prevAngle: number | null = null
  let frozen: PhaseEvidence | null = null

  const noteAngle = (angleDeg: number) => {
    if (prevAngle !== null && crossedTdc(prevAngle, angleDeg)) {
      cycleBest.clear()
    }
    prevAngle = angleDeg
  }

  const reset = () => {
    frames.length = 0
    cycleBest.clear()
    prevAngle = null
    frozen = null
  }

  return {
    reset,
    push(frame, image = null) {
      if (frozen) return
      const angle = pedalAngleDeg(frame.pedal)
      if (angle !== null) {
        noteAngle(angle)
        const phaseId = nearestPhaseId(angle, windowHalfDeg)
        if (phaseId !== null && image) {
          cycleBest.set(phaseId, crankDistanceDeg(angle, targetOf(phaseId)))
        }
      }
      frames.push({
        timestampMs: frame.timestampMs,
        pose: frame.pose,
        pedal: frame.pedal,
        transform: frame.transform,
        image,
      })
    },
    wantsImage(angleDeg) {
      return phaseWantsImage(angleDeg, windowHalfDeg)
    },
    shouldEncode(angleDeg) {
      if (frozen || angleDeg === null || !Number.isFinite(angleDeg)) return false
      const phaseId = nearestPhaseId(angleDeg, windowHalfDeg)
      if (!phaseId) return false
      if (prevAngle !== null && crossedTdc(prevAngle, angleDeg)) {
        return true
      }
      const dist = crankDistanceDeg(angleDeg, targetOf(phaseId))
      const prev = cycleBest.get(phaseId)
      return prev === undefined || dist < prev
    },
    freeze(input) {
      if (frozen) return frozen
      frozen = buildPhaseEvidence({
        frames,
        calibration: input.calibration,
        side: input.side,
        source: input.source,
        metricMethod: input.metricMethod,
        capturedAt: input.capturedAt,
        windowHalfDeg,
      })
      return frozen
    },
    snapshot() {
      return frames.slice()
    },
  }
}

function targetOf(id: PhaseId): number {
  if (id === 'tdc') return 0
  if (id === 'forward') return 90
  if (id === 'bdc') return 180
  return 270
}
