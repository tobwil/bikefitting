import { bikeToPixel, pixelToBike } from '../calibration/index.ts'
import type {
  BikeCalibration,
  BikePoint,
  PixelBikeTransform,
  PixelPoint,
} from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type {
  BodyModel,
  SollHipRegionPx,
  SollMode,
  SollPhaseSource,
  SollReason,
  SollSkeleton,
  SollSolveResult,
} from '../types/soll.ts'
import { SOLL_CHAINS } from '../types/soll.ts'
import { segmentMap } from './segments.ts'
import { phase01ToAngleDeg, pointOnCrankCircle } from './syntheticPhase.ts'
import { pickByScore, segmentLengthOk, twoLink } from './twoLink.ts'

const DEFAULT_TIMEOUT_MS = 8
const TORSO_ANGLES_DEG = range(22, 78, 4)
const HIP_GRID = 7

function range(from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let v = from; v <= to + 1e-9; v += step) out.push(v)
  return out
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function result(partial: Omit<SollSolveResult, 'mode'> & { mode?: SollMode }): SollSolveResult {
  return {
    mode: 'current_setup',
    ...partial,
  }
}

function hipRegionPx(
  saddle: PixelPoint,
  transform: PixelBikeTransform,
  model: BodyModel,
): SollHipRegionPx {
  const s = pixelToBike(saddle, transform)
  const { hipOffset } = model
  const corners: BikePoint[] = [
    { x: s.x + hipOffset.x - hipOffset.tolX, y: s.y + hipOffset.y - hipOffset.tolY },
    { x: s.x + hipOffset.x + hipOffset.tolX, y: s.y + hipOffset.y - hipOffset.tolY },
    { x: s.x + hipOffset.x - hipOffset.tolX, y: s.y + hipOffset.y + hipOffset.tolY },
    { x: s.x + hipOffset.x + hipOffset.tolX, y: s.y + hipOffset.y + hipOffset.tolY },
  ]
  const pix = corners.map((c) => bikeToPixel(c, transform))
  const xs = pix.map((p) => p.x)
  const ys = pix.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

function hipCandidates(saddleBike: BikePoint, model: BodyModel): BikePoint[] {
  const { hipOffset } = model
  const cx = saddleBike.x + hipOffset.x
  const cy = saddleBike.y + hipOffset.y
  const pts: BikePoint[] = [{ x: cx, y: cy }]
  const last = HIP_GRID - 1
  for (let i = 0; i < HIP_GRID; i += 1) {
    for (let j = 0; j < HIP_GRID; j += 1) {
      if (i === Math.floor(HIP_GRID / 2) && j === Math.floor(HIP_GRID / 2)) continue
      const u = i / last
      const v = j / last
      pts.push({
        x: cx + (u - 0.5) * 2 * hipOffset.tolX,
        y: cy + (v - 0.5) * 2 * hipOffset.tolY,
      })
    }
  }
  return pts
}

function assembleFoot(
  ankle: PixelPoint,
  transform: PixelBikeTransform,
  footLen: number,
): { heel: PixelPoint; footIndex: PixelPoint } {
  const a = pixelToBike(ankle, transform)
  const heel = bikeToPixel({ x: a.x - 0.35 * footLen, y: a.y - 0.18 * footLen }, transform)
  const footIndex = bikeToPixel({ x: a.x + 0.62 * footLen, y: a.y - 0.14 * footLen }, transform)
  return { heel, footIndex }
}

function assembleHead(
  shoulder: PixelPoint,
  hip: PixelPoint,
  transform: PixelBikeTransform,
  headLen: number,
): PixelPoint {
  const sh = pixelToBike(shoulder, transform)
  const h = pixelToBike(hip, transform)
  const dx = sh.x - h.x
  const dy = sh.y - h.y
  const n = Math.hypot(dx, dy) || 1
  return bikeToPixel(
    { x: sh.x + (dx / n) * headLen * 0.28, y: sh.y + (dy / n) * headLen * 0.55 + headLen * 0.55 },
    transform,
  )
}

function verifySkeleton(
  sk: SollSkeleton,
  model: BodyModel,
): SollReason | null {
  const j = sk.joints
  const L = segmentMap(model)
  const checks: Array<[PixelPoint, PixelPoint, number, string]> = [
    [j.hip, j.knee, L.thigh.lengthPx, 'thigh'],
    [j.knee, j.ankle, L.shank.lengthPx, 'shank'],
    [j.hip, j.shoulder, L.torso.lengthPx, 'torso'],
    [j.shoulder, j.elbow, L.upperArm.lengthPx, 'upperArm'],
    [j.elbow, j.wrist, L.forearm.lengthPx, 'forearm'],
  ]
  for (const [a, b, expected, name] of checks) {
    if (!segmentLengthOk(a, b, expected)) {
      return {
        code: 'length_violation',
        message: `Refusing to stretch ${name} to hit targets.`,
      }
    }
  }
  return null
}

export type SolveArgs = {
  mode: SollMode
  calibration: BikeCalibration
  pedal: PedalSample | null
  phaseSource: SollPhaseSource
  syntheticPhase01: number
  body: BodyModel
  timeoutMs?: number
}

export function solveSoll(args: SolveArgs): SollSolveResult {
  const started = nowMs()
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const usedEstimatedLengths =
    args.body.segments.some((s) => s.source === 'estimated') ||
    args.body.hipOffset.source === 'estimated' ||
    args.body.crank.source === 'estimated'

  const timedOut = (): boolean => nowMs() - started >= timeoutMs

  const fail = (
    status: SollSolveResult['status'],
    reasons: SollReason[],
    extra: Partial<SollSolveResult> = {},
  ): SollSolveResult =>
    result({
      status,
      reasons,
      skeleton: null,
      hipRegion: extra.hipRegion ?? null,
      crankCircle: extra.crankCircle ?? null,
      phase01: extra.phase01 ?? null,
      phaseSource: args.phaseSource,
      crankRadiusPx: extra.crankRadiusPx ?? null,
      elapsedMs: nowMs() - started,
      usedEstimatedLengths,
      ...extra,
    })

  if (args.mode !== 'current_setup') {
    return fail('insufficient_input', [
      {
        code: 'mode_unsupported',
        message: 'adjustment_simulation is P1 — current_setup only in this build.',
      },
    ])
  }

  const { B, S, G } = args.calibration.marks
  const transform = args.calibration.transform
  if (!B || !S || !G) {
    return fail('insufficient_input', [
      { code: 'missing_marks', message: 'Need calibrated B, S, and G before Soll can run.' },
    ])
  }
  if (!transform) {
    return fail('insufficient_input', [
      { code: 'missing_transform', message: 'Need a pixel↔bike transform (B plus facing from S/G).' },
    ])
  }

  const L = segmentMap(args.body)
  const required = ['thigh', 'shank', 'torso', 'upperArm', 'forearm'] as const
  if (required.some((id) => !(L[id]?.lengthPx > 0))) {
    return fail('insufficient_input', [
      {
        code: 'missing_segments',
        message: 'Body segment lengths are missing. Use estimated placeholders or measure from Ist.',
      },
    ])
  }

  let phase01: number | null = null
  if (args.phaseSource === 'synthetic') {
    phase01 = args.syntheticPhase01
  } else {
    const status = args.pedal?.status
    if (status === 'lost') {
      return fail('insufficient_input', [
        {
          code: 'phase_lost',
          message: 'Crank phase lost — full-body Soll ghost hidden. Ist metrics stay independent.',
        },
      ])
    }
    if (status !== 'locked' || args.pedal?.phase01 === null || args.pedal?.phase01 === undefined) {
      return fail('insufficient_input', [
        {
          code: 'missing_phase',
          message: 'Waiting on a locked pedal phase (or switch to synthetic phase to demo).',
        },
      ])
    }
    phase01 = args.pedal.phase01
  }

  let crankRadius = args.body.crank.lengthPx
  if (args.pedal?.status === 'locked' && args.pedal.pixel) {
    const r = Math.hypot(args.pedal.pixel.x - B.x, args.pedal.pixel.y - B.y)
    if (r > 8) crankRadius = r
  }
  if (!(crankRadius > 0)) {
    return fail('insufficient_input', [
      { code: 'missing_segments', message: 'Crank radius unknown — lock a pedal marker or use estimated length.' },
    ])
  }

  const pedalPx = pointOnCrankCircle(B, crankRadius, phase01ToAngleDeg(phase01))
  const region = hipRegionPx(S, transform, args.body)
  const circle = { center: { x: B.x, y: B.y }, radius: crankRadius }
  const extras = {
    hipRegion: region,
    crankCircle: circle,
    phase01,
    crankRadiusPx: crankRadius,
  }

  const thigh = L.thigh.lengthPx
  const shank = L.shank.lengthPx
  const torso = L.torso.lengthPx
  const upperArm = L.upperArm.lengthPx
  const forearm = L.forearm.lengthPx
  const footLen = L.foot?.lengthPx || thigh * 0.25
  const headLen = L.head?.lengthPx || torso * 0.22

  const saddleBike = pixelToBike(S, transform)
  const hips = hipCandidates(saddleBike, args.body)
  const preferred = hips[0] ?? saddleBike

  type Candidate = {
    hip: PixelPoint
    shoulder: PixelPoint
    knee: PixelPoint
    elbow: PixelPoint
    cost: number
  }

  const acc: { best: Candidate | null } = { best: null }
  let sawLegFail = false
  let sawArmFail = false

  const consider = (hipBike: BikePoint): boolean => {
    if (timedOut()) return false
    const hip = bikeToPixel(hipBike, transform)
    const leg = twoLink(hip, pedalPx, thigh, shank)
    if (!leg) {
      sawLegFail = true
      return true
    }
    const knee = pickByScore(leg.mid, leg.other, (p) => pixelToBike(p, transform).x)

    let localArmFail = true
    for (const deg of TORSO_ANGLES_DEG) {
      const rad = (deg * Math.PI) / 180
      const shBike: BikePoint = {
        x: hipBike.x + torso * Math.sin(rad),
        y: hipBike.y + torso * Math.cos(rad),
      }
      const shoulder = bikeToPixel(shBike, transform)
      const arm = twoLink(shoulder, G, upperArm, forearm)
      if (!arm) continue
      localArmFail = false
      const elbow = pickByScore(arm.mid, arm.other, (p) => -pixelToBike(p, transform).y)
      const cost =
        (hipBike.x - preferred.x) ** 2 +
        (hipBike.y - preferred.y) ** 2 +
        ((deg - 55) / 40) ** 2 * (args.body.hipOffset.tolX ** 2)
      if (!acc.best || cost < acc.best.cost) {
        acc.best = { hip, shoulder, knee, elbow, cost }
        if (cost < 1e-6) return false
      }
    }
    if (localArmFail) sawArmFail = true
    return true
  }

  if (!consider(preferred)) {
    /* preferred hit with ~zero cost — skip grid */
  } else {
    for (let i = 1; i < hips.length; i += 1) {
      if (timedOut()) break
      const hip = hips[i]
      if (!hip) continue
      if (!consider(hip) && acc.best) break
    }
  }

  if (timedOut() && !acc.best) {
    return fail('timeout', [{ code: 'timeout', message: `Solver exceeded ${timeoutMs} ms without a feasible pose.` }], extras)
  }

  const best = acc.best
  if (!best) {
    const reasons: SollReason[] = []
    if (sawLegFail) {
      reasons.push({
        code: 'leg_unreachable',
        message: 'Pedal on the crank circle is outside thigh+shank reach from the hip box. Saddle was not moved.',
      })
    }
    if (sawArmFail) {
      reasons.push({
        code: 'arm_unreachable',
        message: 'Hand at G is outside torso+arm reach from the hip box. Bars were not moved.',
      })
    }
    if (reasons.length === 0) {
      reasons.push({
        code: 'leg_unreachable',
        message: 'No feasible pose on this setup with the current fixed segment lengths.',
      })
    }
    return fail('infeasible', reasons, extras)
  }

  const foot = assembleFoot(pedalPx, transform, footLen)
  const head = assembleHead(best.shoulder, best.hip, transform, headLen)
  const skeleton: SollSkeleton = {
    joints: {
      head,
      shoulder: best.shoulder,
      elbow: best.elbow,
      wrist: { x: G.x, y: G.y },
      hip: best.hip,
      knee: best.knee,
      ankle: pedalPx,
      heel: foot.heel,
      footIndex: foot.footIndex,
    },
    chains: SOLL_CHAINS,
  }

  const stretch = verifySkeleton(skeleton, args.body)
  if (stretch) {
    return fail('infeasible', [stretch], extras)
  }

  return result({
    status: 'feasible',
    reasons: [],
    skeleton,
    ...extras,
    phaseSource: args.phaseSource,
    elapsedMs: nowMs() - started,
    usedEstimatedLengths,
  })
}

export function emptySollResult(): SollSolveResult {
  return {
    status: 'insufficient_input',
    reasons: [{ code: 'not_started', message: 'Soll solver has not run yet.' }],
    mode: 'current_setup',
    skeleton: null,
    hipRegion: null,
    crankCircle: null,
    phase01: null,
    phaseSource: 'pedal',
    crankRadiusPx: null,
    elapsedMs: 0,
    usedEstimatedLengths: true,
  }
}
