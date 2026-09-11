import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import type { PixelPoint } from '../types/calibration.ts'
import { createPixelImage, fillDisk, strokeCircle, strokeLine, type PixelImage } from './pixels.ts'

export const FIXTURE_STILL_SIZE = { width: 1280, height: 720 } as const

export type FixtureStillOptions = {
  /** Second frame offset to the right — requires the user to pick a bike. */
  extraBike?: boolean
  /** Cover the crank axis so B must be marked uncertain. */
  occludeB?: boolean
  /** Flatten the view so side orientation is unusable. */
  badPerspective?: boolean
  /** Draw a rider arm to the hoods. */
  rider?: boolean
  /** Blank / no bike. */
  empty?: boolean
}

const GOLD: [number, number, number] = [196, 163, 90]
const WHEEL: [number, number, number] = [106, 92, 72]
const RIDER: [number, number, number] = [232, 224, 212]
const OCCLUDE: [number, number, number] = [22, 19, 15]

function drawBike(image: PixelImage, marks: { B: PixelPoint; S: PixelPoint; G: PixelPoint }, scaleY = 1) {
  const map = (p: PixelPoint): PixelPoint => ({ x: p.x, y: image.height / 2 + (p.y - image.height / 2) * scaleY })
  const B = map(marks.B)
  const S = map(marks.S)
  const G = map(marks.G)
  const rear = { x: B.x - 220, y: B.y }
  const front = { x: B.x + 280, y: B.y }
  strokeCircle(image, rear.x, rear.y, 118, WHEEL, 8)
  strokeCircle(image, front.x, front.y, 118, WHEEL, 8)
  strokeLine(image, B.x, B.y, S.x, S.y, GOLD, 6)
  strokeLine(image, S.x, S.y, G.x, G.y, GOLD, 6)
  strokeLine(image, G.x, G.y, B.x, B.y, GOLD, 6)
  return { B, S, G }
}

/** Local synthetic still — same pixel coords as the live fixture, no camera. */
export function renderFixtureStill(opts: FixtureStillOptions = {}): PixelImage {
  const image = createPixelImage(FIXTURE_STILL_SIZE.width, FIXTURE_STILL_SIZE.height, [22, 19, 15, 255])
  if (opts.empty) return image

  const scaleY = opts.badPerspective ? 0.18 : 1
  drawBike(image, SYNTHETIC_MARKS, scaleY)

  if (opts.extraBike) {
    const shift = 360
    drawBike(
      image,
      {
        B: { x: SYNTHETIC_MARKS.B.x + shift, y: SYNTHETIC_MARKS.B.y },
        S: { x: SYNTHETIC_MARKS.S.x + shift, y: SYNTHETIC_MARKS.S.y },
        G: { x: SYNTHETIC_MARKS.G.x + shift, y: SYNTHETIC_MARKS.G.y },
      },
      scaleY,
    )
  }

  if (opts.occludeB) {
    fillDisk(image, SYNTHETIC_MARKS.B.x, SYNTHETIC_MARKS.B.y, 36, OCCLUDE)
  }

  if (opts.rider) {
    const hip = { x: SYNTHETIC_MARKS.S.x + 36, y: SYNTHETIC_MARKS.S.y + 28 }
    const shoulder = { x: SYNTHETIC_MARKS.G.x - 150, y: SYNTHETIC_MARKS.G.y - 70 }
    const elbow = { x: SYNTHETIC_MARKS.G.x - 70, y: SYNTHETIC_MARKS.G.y - 10 }
    strokeLine(image, shoulder.x, shoulder.y, hip.x, hip.y, RIDER, 7)
    strokeLine(image, shoulder.x, shoulder.y, elbow.x, elbow.y, RIDER, 7)
    strokeLine(image, elbow.x, elbow.y, SYNTHETIC_MARKS.G.x, SYNTHETIC_MARKS.G.y, RIDER, 7)
  }

  return image
}

export function fixtureRefs() {
  return {
    B: { ...SYNTHETIC_MARKS.B },
    S: { ...SYNTHETIC_MARKS.S },
    G: { ...SYNTHETIC_MARKS.G },
  }
}
