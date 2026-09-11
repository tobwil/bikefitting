import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { landmarkToPixel } from '../pose/drawIst.ts'
import { inferNearSide, isLandmarkVisible, landmarkForJoint } from '../pose/nearSide.ts'
import { lengthAdviceAllowed } from '../scale/advice.ts'
import type { PlaneScale } from '../types/scale.ts'
import {
  FOOT_DIAGNOSTIC_SCHEMA_VERSION,
  type FootCycleDiagnostic,
  type FootFrameSample,
  type FootLandmarkSample,
} from '../types/foot.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'

export function emptyFootDiagnostic(reason = 'Noch keine Fußdiagnose über den Tretzyklus.'): FootCycleDiagnostic {
  return {
    schemaVersion: FOOT_DIAGNOSTIC_SCHEMA_VERSION,
    status: 'insufficient',
    reason,
    samples: 0,
    usableSamples: 0,
    occludedSamples: 0,
    heelOccluded: false,
    toeOccluded: false,
    metricLocked: false,
    lengthClaimsAllowed: false,
    overlay: { heelVisible: false, toeVisible: false },
    metricCards: [],
    recommendations: [],
  }
}

function landmarkSample(
  frame: PoseFrame,
  joint: 'HEEL' | 'FOOT_INDEX',
  minVisibility: number,
): FootLandmarkSample {
  const near = frame.nearSide ?? inferNearSide(frame.landmarks, minVisibility) ?? 'right'
  const lm = frame.landmarks[landmarkForJoint(near, joint)]
  const occluded = !isLandmarkVisible(lm, minVisibility)
  return {
    pixel: occluded || !lm ? null : landmarkToPixel(lm, frame.videoWidth, frame.videoHeight),
    visibility: lm?.visibility ?? 0,
    occluded,
  }
}

export function sampleFootFrame(
  frame: PoseFrame | null,
  pedal: PedalSample | null,
  minVisibility = MIN_LANDMARK_VISIBILITY,
): FootFrameSample | null {
  if (!frame || frame.landmarks.length === 0) return null
  const heel = landmarkSample(frame, 'HEEL', minVisibility)
  const toe = landmarkSample(frame, 'FOOT_INDEX', minVisibility)
  return {
    timestampMs: frame.timestampMs,
    crankAngleDeg: pedal?.crankAngleDeg ?? null,
    heel,
    toe,
    metricLocked: heel.occluded || toe.occluded,
  }
}

export function summarizeFootCycle(
  samples: readonly FootFrameSample[],
  scale: PlaneScale | null | undefined,
): FootCycleDiagnostic {
  if (samples.length === 0) return emptyFootDiagnostic('Keine Fußsamples über den Tretzyklus.')
  let occluded = 0
  let usable = 0
  let heelOcc = false
  let toeOcc = false
  let lastHeel = false
  let lastToe = false
  for (const sample of samples) {
    if (sample.heel.occluded) heelOcc = true
    if (sample.toe.occluded) toeOcc = true
    if (sample.metricLocked) occluded += 1
    else usable += 1
    lastHeel = !sample.heel.occluded
    lastToe = !sample.toe.occluded
  }
  const metricLocked = heelOcc || toeOcc
  const scaleOk = lengthAdviceAllowed(scale)
  let status: FootCycleDiagnostic['status'] = 'visible'
  let reason = 'Ferse und Zehenspitze über den Zyklus sichtbar. Extra-Diagnose — keine Metrikkarte.'
  if (usable === 0 && occluded === 0) {
    status = 'insufficient'
    reason = 'Keine nutzbaren Fußsamples.'
  } else if (metricLocked) {
    status = 'occluded'
    reason = heelOcc && toeOcc
      ? 'Ferse und Zehenspitze verdeckt — Fußmetrik gesperrt.'
      : heelOcc
        ? 'Ferse verdeckt — Fußmetrik gesperrt.'
        : 'Zehenspitze verdeckt — Fußmetrik gesperrt.'
  } else if (!scaleOk) {
    status = 'no_scale_length_blocked'
    reason = 'Fuß sichtbar. Längenangaben ohne bestätigten Maßstab bleiben aus.'
  }
  return {
    schemaVersion: FOOT_DIAGNOSTIC_SCHEMA_VERSION,
    status,
    reason,
    samples: samples.length,
    usableSamples: usable,
    occludedSamples: occluded,
    heelOccluded: heelOcc,
    toeOccluded: toeOcc,
    metricLocked,
    lengthClaimsAllowed: scaleOk && !metricLocked,
    overlay: { heelVisible: lastHeel, toeVisible: lastToe },
    metricCards: [],
    recommendations: [],
  }
}

export function createFootCollector(minVisibility = MIN_LANDMARK_VISIBILITY) {
  const samples: FootFrameSample[] = []
  return {
    push(frame: PoseFrame | null, pedal: PedalSample | null) {
      const sample = sampleFootFrame(frame, pedal, minVisibility)
      if (sample) samples.push(sample)
    },
    reset() {
      samples.length = 0
    },
    snapshot(scale: PlaneScale | null | undefined): FootCycleDiagnostic {
      return summarizeFootCycle(samples, scale)
    },
    size() {
      return samples.length
    },
    /** Frame samples for segment-reset / evidence checks. */
    samples(): readonly FootFrameSample[] {
      return samples
    },
  }
}

export type FootCollector = ReturnType<typeof createFootCollector>
