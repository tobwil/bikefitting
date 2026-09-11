import { CALIBRATION_SCHEMA_VERSION } from '../types/calibration.ts'
import type { MeasurementResult } from '../types/result.ts'
import { SESSION_SCHEMA_VERSION, type MeasurementSession, type SessionMetrics, type SessionQuality } from '../types/session.ts'
import { coerceSide, isHandPosition, newSessionId, parseSession } from './schema.ts'

export type LiveFitInput = {
  bike: string
  side: string
  handPosition: string
  calibrationVersion?: number
  label?: string
  capturedAt?: string
  metrics: SessionMetrics
  quality: SessionQuality
  result?: MeasurementResult | null
}

export function averageVisibility(landmarks: Array<{ visibility: number }> | null | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null
  let sum = 0
  let n = 0
  for (const lm of landmarks) {
    if (Number.isFinite(lm.visibility)) {
      sum += lm.visibility
      n += 1
    }
  }
  return n === 0 ? null : sum / n
}

export function emptyMetrics(): SessionMetrics {
  return {
    kneeFlexionDeg: null,
    crankAngleDeg: null,
    pedalPhase01: null,
    pedalRevolutions: 0,
    inferenceMs: null,
  }
}

export function emptyQuality(): SessionQuality {
  return {
    landmarkVisibility: null,
    poseEngine: 'none',
    frameSync: 'none',
    pedalStatus: 'none',
    calibrationReady: false,
  }
}

export function buildSession(input: LiveFitInput, now = new Date().toISOString()): MeasurementSession {
  if (!isHandPosition(input.handPosition)) {
    throw new Error(`unknown hand position: ${input.handPosition}`)
  }
  const session: MeasurementSession = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: newSessionId(),
    createdAt: now,
    updatedAt: now,
    capturedAt: input.capturedAt ?? now,
    label: input.label?.trim() ?? '',
    conditions: {
      bike: input.bike.trim(),
      side: coerceSide(input.side),
      handPosition: input.handPosition,
      calibrationVersion: input.calibrationVersion ?? CALIBRATION_SCHEMA_VERSION,
    },
    metrics: { ...input.metrics },
    quality: { ...input.quality },
    result: input.result ?? null,
  }
  const parsed = parseSession(session)
  if (!parsed.ok) throw new Error(parsed.reason)
  return parsed.value
}
