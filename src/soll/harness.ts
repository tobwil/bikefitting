import { SYNTHETIC_CRANK_PX, SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import type { BikeCalibration } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import { estimateBodyModel, scaledBodyModel, segmentMap } from './segments.ts'
import { solveSoll } from './solver.ts'
import { segmentLengthOk } from './twoLink.ts'

export type SollHarnessCase = {
  name: string
  status: string
  passed: boolean
  detail: string
}

export type SollHarnessResult = {
  passed: boolean
  cases: SollHarnessCase[]
  message: string
}

function fixtureCalibration(): BikeCalibration {
  const marks = { B: { ...SYNTHETIC_MARKS.B }, S: { ...SYNTHETIC_MARKS.S }, G: { ...SYNTHETIC_MARKS.G } }
  const now = new Date().toISOString()
  return {
    version: 1,
    marks,
    transform: computePixelBikeTransform(marks),
    createdAt: now,
    updatedAt: now,
  }
}

function lockedPedal(phase01: number): PedalSample {
  return {
    timestampMs: 0,
    pixel: {
      x: SYNTHETIC_MARKS.B.x + SYNTHETIC_CRANK_PX * Math.sin(phase01 * Math.PI * 2),
      y: SYNTHETIC_MARKS.B.y - SYNTHETIC_CRANK_PX * Math.cos(phase01 * Math.PI * 2),
    },
    crankAngleDeg: phase01 * 360,
    phase01,
    revolutions: 1,
    status: 'locked',
    lostFrames: 0,
  }
}

function lostPedal(): PedalSample {
  return {
    timestampMs: 0,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status: 'lost',
    lostFrames: 20,
  }
}

/** VM-safe checks: feasible fixture, lost phase, infeasible short limbs, no stretched bones. */
export function runSollHarness(): SollHarnessResult {
  const calibration = fixtureCalibration()
  const body = estimateBodyModel(calibration)
  const cases: SollHarnessCase[] = []

  if (!body || !calibration.transform) {
    return { passed: false, cases: [], message: 'Harness failed — fixture calibration missing.' }
  }

  const feasible = solveSoll({
    mode: 'current_setup',
    calibration,
    pedal: lockedPedal(0.12),
    phaseSource: 'pedal',
    syntheticPhase01: 0,
    body,
  })
  const sk = feasible.skeleton
  const L = segmentMap(body)
  const lengthsOk =
    feasible.status === 'feasible' &&
    sk !== null &&
    segmentLengthOk(sk.joints.hip, sk.joints.knee, L.thigh.lengthPx) &&
    segmentLengthOk(sk.joints.knee, sk.joints.ankle, L.shank.lengthPx) &&
    segmentLengthOk(sk.joints.hip, sk.joints.shoulder, L.torso.lengthPx) &&
    segmentLengthOk(sk.joints.shoulder, sk.joints.elbow, L.upperArm.lengthPx) &&
    segmentLengthOk(sk.joints.elbow, sk.joints.wrist, L.forearm.lengthPx)
  cases.push({
    name: 'fixture-feasible',
    status: feasible.status,
    passed: feasible.status === 'feasible' && lengthsOk,
    detail: lengthsOk ? 'Ghost on fixture, bones unstretched.' : `status=${feasible.status}`,
  })

  const synthetic = solveSoll({
    mode: 'current_setup',
    calibration,
    pedal: lostPedal(),
    phaseSource: 'synthetic',
    syntheticPhase01: 0.4,
    body,
  })
  cases.push({
    name: 'synthetic-phase-demo',
    status: synthetic.status,
    passed: synthetic.status === 'feasible' && synthetic.skeleton !== null,
    detail: 'Synthetic phase still solves when the pedal lock is lost.',
  })

  const lost = solveSoll({
    mode: 'current_setup',
    calibration,
    pedal: lostPedal(),
    phaseSource: 'pedal',
    syntheticPhase01: 0.4,
    body,
  })
  cases.push({
    name: 'phase-lost-hides-ghost',
    status: lost.status,
    passed: lost.status === 'insufficient_input' && lost.skeleton === null && lost.reasons.some((r) => r.code === 'phase_lost'),
    detail: 'Pedal LOST → insufficient_input, no skeleton.',
  })

  const short = solveSoll({
    mode: 'current_setup',
    calibration,
    pedal: lockedPedal(0.5),
    phaseSource: 'pedal',
    syntheticPhase01: 0,
    body: scaledBodyModel(body, 0.28),
  })
  cases.push({
    name: 'infeasible-no-fake-setup',
    status: short.status,
    passed: short.status === 'infeasible' && short.skeleton === null,
    detail: short.reasons.map((r) => r.code).join(',') || 'expected infeasible',
  })

  const p1 = solveSoll({
    mode: 'adjustment_simulation',
    calibration,
    pedal: lockedPedal(0),
    phaseSource: 'synthetic',
    syntheticPhase01: 0,
    body,
  })
  cases.push({
    name: 'p1-mode-rejected',
    status: p1.status,
    passed: p1.status === 'insufficient_input' && p1.skeleton === null,
    detail: 'adjustment_simulation is not implemented.',
  })

  const passed = cases.every((c) => c.passed)
  return {
    passed,
    cases,
    message: passed
      ? `Soll harness passed — ${cases.length} cases (feasible / synthetic phase / LOST / infeasible / P1 reject).`
      : `Soll harness failed — ${cases.filter((c) => !c.passed).map((c) => c.name).join(', ')}.`,
  }
}
