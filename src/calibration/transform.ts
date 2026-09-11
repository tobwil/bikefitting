import type {
  BikeCalibration,
  BikeFacing,
  BikePoint,
  PixelBikeTransform,
  PixelPoint,
} from '../types/calibration.ts'

const COLINEAR_X_EPS = 1e-3

function facingFromMarks(marks: BikeCalibration['marks']): BikeFacing | null {
  const { B, S, G } = marks
  if (!B) return null
  const signX = (dx: number): BikeFacing | null => {
    if (Math.abs(dx) <= COLINEAR_X_EPS) return null
    return dx > 0 ? 1 : -1
  }
  if (S && G) {
    const fromTopTube = signX(G.x - S.x)
    if (fromTopTube) return fromTopTube
  }
  if (G) {
    const fromGrip = signX(G.x - B.x)
    if (fromGrip) return fromGrip
  }
  if (S) {
    const fromSaddle = signX(B.x - S.x)
    if (fromSaddle) return fromSaddle
  }
  return null
}

export function computePixelBikeTransform(
  marks: BikeCalibration['marks'],
): PixelBikeTransform | null {
  const b = marks.B
  if (!b) return null
  const facing = facingFromMarks(marks)
  if (!facing) return null
  return {
    originPx: { x: b.x, y: b.y },
    forwardPx: { x: facing, y: 0 },
    upPx: { x: 0, y: -1 },
    facing,
    pixelsPerMm: null,
  }
}

export function pixelToBike(pixel: PixelPoint, transform: PixelBikeTransform): BikePoint {
  const dx = pixel.x - transform.originPx.x
  const dy = pixel.y - transform.originPx.y
  let x = dx * transform.forwardPx.x + dy * transform.forwardPx.y
  let y = dx * transform.upPx.x + dy * transform.upPx.y
  if (transform.pixelsPerMm && transform.pixelsPerMm > 0) {
    x /= transform.pixelsPerMm
    y /= transform.pixelsPerMm
  }
  return { x, y }
}

export function bikeToPixel(bike: BikePoint, transform: PixelBikeTransform): PixelPoint {
  let x = bike.x
  let y = bike.y
  if (transform.pixelsPerMm && transform.pixelsPerMm > 0) {
    x *= transform.pixelsPerMm
    y *= transform.pixelsPerMm
  }
  return {
    x: transform.originPx.x + x * transform.forwardPx.x + y * transform.upPx.x,
    y: transform.originPx.y + x * transform.forwardPx.y + y * transform.upPx.y,
  }
}
