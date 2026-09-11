import { createPedalTracker } from './tracker.ts'
import { renderSyntheticCrankFrame, syntheticMarkerPixel } from './synthetic.ts'

export type PedalHarnessCase = {
  name: string
  revolutions: number
  lost: boolean
  passed: boolean
}

export type PedalHarnessResult = {
  passed: boolean
  cases: PedalHarnessCase[]
  revolutions: number
  message: string
}

const WIDTH = 320
const HEIGHT = 240
const ORIGIN = { x: 160, y: 120 }
const RADIUS = 60
const SAMPLES_PER_REV = 24
const TARGET_REVS = 12

function runCircleCase(name: string, dropAfterRev: number | null): PedalHarnessCase {
  const tracker = createPedalTracker({ minAreaPx: 8, maxLostFrames: 8 })
  tracker.setBottomBracket(ORIGIN)
  const frame = new ImageData(WIDTH, HEIGHT)
  const first = syntheticMarkerPixel(0, ORIGIN, RADIUS)
  tracker.seed(first.x, first.y)

  let lastRevs = 0
  let lost = false
  const frames = TARGET_REVS * SAMPLES_PER_REV
  for (let i = 0; i < frames; i += 1) {
    const rev = i / SAMPLES_PER_REV
    const timestampMs = (i / SAMPLES_PER_REV) * (60 / 90) * 1000
    if (dropAfterRev !== null && rev >= dropAfterRev) {
      for (let p = 0; p < frame.data.length; p += 4) {
        frame.data[p] = 18
        frame.data[p + 1] = 16
        frame.data[p + 2] = 14
        frame.data[p + 3] = 255
      }
    } else {
      renderSyntheticCrankFrame(frame, timestampMs, ORIGIN, RADIUS)
    }
    const sample = tracker.update(frame, timestampMs)
    lastRevs = sample.revolutions
    if (sample.status === 'lost') lost = true
  }

  const needLock = dropAfterRev === null
  const passed = needLock ? lastRevs >= 10 && !lost : lost
  return { name, revolutions: lastRevs, lost, passed }
}

/** Synthetic ≥10-revolution lock plus a visible LOST case. Safe on a VM. */
export function runTenRevolutionHarness(): PedalHarnessResult {
  const cases = [
    runCircleCase('ten-plus-revolutions', null),
    runCircleCase('lost-lock-visible', 2),
  ]
  const revolutions = cases[0]?.revolutions ?? 0
  const passed = cases.every((c) => c.passed)
  return {
    passed,
    cases,
    revolutions,
    message: passed
      ? `Harness passed — ${revolutions} revs locked, LOST case visible.`
      : `Harness failed — lock=${revolutions} revs, LOST=${String(cases[1]?.lost)}.`,
  }
}
