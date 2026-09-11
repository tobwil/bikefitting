import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import {
  BIKE_DETECT_DETECTOR,
  type BikeDetectVersion,
  type BikeFacing,
  type BikeMarkId,
  type DetectViewQuality,
  type MarkProvenance,
  type PixelPoint,
} from '../types/calibration.ts'
import { fixtureRefs, renderFixtureStill, type FixtureStillOptions } from './fixtureStill.ts'
import type { PixelImage } from './pixels.ts'

export const DETECT_VERSION: BikeDetectVersion = {
  detector: BIKE_DETECT_DETECTOR,
  model: null,
}

export type BikeRegion = {
  x: number
  y: number
  width: number
  height: number
  facing: BikeFacing | null
  confidence: number
}

export type DetectedMark = {
  id: BikeMarkId
  pixel: PixelPoint
  visibility: number
  confidence: number
  occluded: boolean
  uncertain: boolean
  status: MarkProvenance['status']
  origin: MarkProvenance['origin']
  gripKind?: MarkProvenance['gripKind']
}

export type BikeCandidate = {
  id: string
  region: BikeRegion
  points: Record<BikeMarkId, DetectedMark | null>
  viewQuality: DetectViewQuality
  message: string
}

export type BikeDetectOutput = {
  version: BikeDetectVersion
  image: { width: number; height: number }
  candidates: BikeCandidate[]
  riderPresent: boolean
  perspectiveOk: boolean
  message: string
}

const GOLD_MIN = 40

function isGold(r: number, g: number, b: number): boolean {
  return r > 150 && g > 110 && b < 130 && r - b > 40 && r >= g
}

function collectGold(image: PixelImage): PixelPoint[] {
  const pts: PixelPoint[] = []
  const { width, height, data } = image
  const step = width >= 800 ? 2 : 1
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (isGold(data[i]!, data[i + 1]!, data[i + 2]!)) pts.push({ x, y })
    }
  }
  return pts
}

function bboxOf(pts: PixelPoint[]): BikeRegion | null {
  if (pts.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, facing: null, confidence: 0 }
}

function clusterGold(pts: PixelPoint[]): PixelPoint[][] {
  if (pts.length === 0) return []
  const box = bboxOf(pts)
  if (!box) return []
  if (box.width < 80) return [pts]

  const mid = box.x + box.width / 2
  const left = pts.filter((p) => p.x < mid)
  const right = pts.filter((p) => p.x >= mid)
  const leftBox = bboxOf(left)
  const rightBox = bboxOf(right)
  const gap =
    leftBox && rightBox ? rightBox.x - (leftBox.x + leftBox.width) : 0
  if (left.length > GOLD_MIN && right.length > GOLD_MIN && gap > 80) {
    return [left, right]
  }
  return [pts]
}

function mean(pts: PixelPoint[]): PixelPoint {
  let x = 0
  let y = 0
  for (const p of pts) {
    x += p.x
    y += p.y
  }
  return { x: x / pts.length, y: y / pts.length }
}

function quantileY(pts: PixelPoint[], q: number): number {
  const ys = pts.map((p) => p.y).sort((a, b) => a - b)
  const i = Math.min(ys.length - 1, Math.max(0, Math.floor((ys.length - 1) * q)))
  return ys[i]!
}

function quantileX(pts: PixelPoint[], q: number): number {
  const xs = pts.map((p) => p.x).sort((a, b) => a - b)
  const i = Math.min(xs.length - 1, Math.max(0, Math.floor((xs.length - 1) * q)))
  return xs[i]!
}

function bottomCluster(pts: PixelPoint[]): { pixel: PixelPoint; occluded: boolean } {
  const floor = quantileY(pts, 0.95)
  const low = pts.filter((p) => p.y >= floor)
  if (low.length < 4) {
    const fallback = pts.reduce((a, b) => (a.y > b.y ? a : b))
    return { pixel: fallback, occluded: true }
  }
  return { pixel: mean(low), occluded: false }
}

/**
 * Saddle = top-of-saddle contact (marks.ts), not the nose and not a top-tube midpoint.
 * Rear-upper cluster, then the highest band of that cluster.
 */
function saddleTop(pts: PixelPoint[], facing: BikeFacing): PixelPoint | null {
  const upper = pts.filter((p) => p.y <= quantileY(pts, 0.48))
  if (upper.length === 0) return null
  const rearCut = facing === 1 ? quantileX(upper, 0.14) : quantileX(upper, 0.86)
  const rear = upper.filter((p) => (facing === 1 ? p.x <= rearCut : p.x >= rearCut))
  const pool = rear.length >= 4 ? rear : upper
  const topY = quantileY(pool, 0.15)
  const band = pool.filter((p) => p.y <= topY + 8)
  return mean(band.length ? band : pool)
}

function hoods(pts: PixelPoint[], facing: BikeFacing): PixelPoint | null {
  const midX = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const front = pts.filter((p) => (facing === 1 ? p.x >= midX : p.x <= midX))
  if (front.length === 0) return null
  const ranked = [...front].sort((a, b) => (facing === 1 ? b.x - a.x : a.x - b.x))
  const tip = ranked.slice(0, Math.max(10, Math.floor(ranked.length * 0.08)))
  return mean(tip)
}

function guessFacing(pts: PixelPoint[]): BikeFacing {
  const left = pts.filter((p) => p.x <= mean(pts).x)
  const right = pts.filter((p) => p.x > mean(pts).x)
  const leftTop = left.length ? Math.min(...left.map((p) => p.y)) : Infinity
  const rightTop = right.length ? Math.min(...right.map((p) => p.y)) : Infinity
  // Hoods sit at least as high as the saddle and further forward.
  return rightTop <= leftTop ? 1 : -1
}

function facingOf(s: PixelPoint, g: PixelPoint): BikeFacing | null {
  const dx = g.x - s.x
  if (Math.abs(dx) < 12) return null
  return dx > 0 ? 1 : -1
}

function mark(
  id: BikeMarkId,
  pixel: PixelPoint,
  extras: Partial<DetectedMark> = {},
): DetectedMark {
  return {
    id,
    pixel,
    visibility: extras.visibility ?? 1,
    confidence: extras.confidence ?? 0.8,
    occluded: extras.occluded ?? false,
    uncertain: extras.uncertain ?? false,
    status: extras.status ?? 'proposed',
    origin: extras.origin ?? 'auto',
    gripKind: extras.gripKind,
  }
}

function candidateFromCluster(
  id: string,
  pts: PixelPoint[],
  image: PixelImage,
  riderPresent: boolean,
): BikeCandidate | null {
  const region = bboxOf(pts)
  if (!region || pts.length < GOLD_MIN) return null

  const aspect = region.height / Math.max(1, region.width)
  if (region.width < 40 || region.height < 18) {
    return {
      id,
      region: { ...region, confidence: 0.2 },
      points: { B: null, S: null, G: null },
      viewQuality: 'bad_perspective',
      message: 'Seitenansicht ungeeignet — Fahrrad neu ausrichten. Keine Millimeter aus einer flachen Ansicht.',
    }
  }
  if (aspect < 0.22) {
    return {
      id,
      region: { ...region, confidence: 0.25, facing: null },
      points: { B: null, S: null, G: null },
      viewQuality: 'bad_perspective',
      message: 'Perspektive zu flach. Kamera auf Höhe der Tretlager-Mitte, echte Seitenansicht.',
    }
  }

  const facingGuess = guessFacing(pts)
  const S = saddleTop(pts, facingGuess)
  const G = S ? hoods(pts, facingGuess) : null
  const facing = S && G ? facingOf(S, G) ?? facingGuess : null
  const bb = bottomCluster(pts)
  if (!S || !G || !facing) {
    return {
      id,
      region: { ...region, facing, confidence: 0.3 },
      points: { B: null, S: S ? mark('S', S, { confidence: 0.45, uncertain: true }) : null, G: null },
      viewQuality: 'ambiguous',
      message: 'Fahrrad erkannt, Kalibrierpunkte unklar. Manuell setzen.',
    }
  }

  region.facing = facing
  region.confidence = Math.min(0.93, 0.45 + pts.length / 4000)
  const pad = 28
  region.x = Math.max(0, region.x - pad)
  region.y = Math.max(0, region.y - pad)
  region.width = Math.min(image.width - region.x, region.width + pad * 2)
  region.height = Math.min(image.height - region.y, region.height + pad * 2)

  const B = mark('B', bb.pixel, {
    occluded: bb.occluded,
    uncertain: bb.occluded,
    visibility: bb.occluded ? 0.25 : 0.9,
    confidence: bb.occluded ? 0.35 : 0.82,
  })
  const saddle = mark('S', S, { confidence: 0.8, visibility: 0.92 })
  const grip = mark('G', G, {
    confidence: riderPresent ? 0.7 : 0.78,
    visibility: 0.88,
    gripKind: 'bike_ref',
    uncertain: false,
  })

  return {
    id,
    region,
    points: { B, S: saddle, G: grip },
    viewQuality: bb.occluded ? 'occluded' : 'ok',
    message: bb.occluded
      ? 'Tretlager verdeckt — Vorschlag unsicher, nicht stillschweigend bestätigt.'
      : 'Fahrrad in Seitenansicht. Punkte prüfen, nicht als fertig annehmen.',
  }
}

/**
 * Local geometry prototype. Person pose is not bike calibration.
 * Finding a "bicycle" class label is not success — B/S/G must be proposed.
 */
export function detectBikeFromPixels(image: PixelImage, opts: { riderPresent?: boolean } = {}): BikeDetectOutput {
  const riderPresent = opts.riderPresent ?? false
  const gold = collectGold(image)
  if (gold.length < GOLD_MIN) {
    return {
      version: DETECT_VERSION,
      image: { width: image.width, height: image.height },
      candidates: [],
      riderPresent,
      perspectiveOk: false,
      message: 'Kein Fahrradrahmen in der Seitenansicht. Manuell kalibrieren — nichts blockiert.',
    }
  }

  const clusters = clusterGold(gold)
  const candidates = clusters
    .map((pts, i) => candidateFromCluster(`bike-${i + 1}`, pts, image, riderPresent))
    .filter((c): c is BikeCandidate => Boolean(c))

  if (candidates.length === 0) {
    return {
      version: DETECT_VERSION,
      image: { width: image.width, height: image.height },
      candidates: [],
      riderPresent,
      perspectiveOk: false,
      message: 'Rahmen gefunden, aber keine B/S/G-Kandidaten. Manuell setzen.',
    }
  }

  if (candidates.length > 1) {
    for (const c of candidates) {
      c.viewQuality = c.viewQuality === 'ok' ? 'multiple' : c.viewQuality
      c.message = 'Mehrere Fahrräder — bitte eines wählen.'
    }
  }

  const perspectiveOk = candidates.some((c) => c.viewQuality === 'ok' || c.viewQuality === 'occluded' || c.viewQuality === 'multiple')
  return {
    version: DETECT_VERSION,
    image: { width: image.width, height: image.height },
    candidates,
    riderPresent,
    perspectiveOk,
    message:
      candidates.length > 1
        ? 'Mehrere Fahrräder im Bild. Eines wählen, dann Punkte prüfen.'
        : (candidates[0]?.message ?? 'Vorschläge prüfen.'),
  }
}

/** A detector class label alone never yields B/S/G. */
export function detectFromObjectClass(label: string): BikeDetectOutput {
  const name = label.trim().toLowerCase()
  return {
    version: { detector: 'class-label.rejected', model: null },
    image: { width: 0, height: 0 },
    candidates: [],
    riderPresent: false,
    perspectiveOk: false,
    message:
      name === 'bicycle' || name === 'bike' || name === 'fahrrad'
        ? 'Klasse „bicycle“ ist keine Kalibrierung. B, S und G bleiben unbestimmt.'
        : `Objektklasse „${label}“ ist keine B/S/G-Kalibrierung.`,
  }
}

export function knownRefsInside(candidate: BikeCandidate, refs: Record<BikeMarkId, PixelPoint>, maxDist = 28): boolean {
  return (['B', 'S', 'G'] as const).every((id) => {
    const p = candidate.points[id]
    if (!p || p.uncertain) return false
    return Math.hypot(p.pixel.x - refs[id].x, p.pixel.y - refs[id].y) <= maxDist
  })
}

/** Fixture path for VM / harness: known refs as proposals, same confirm contract. */
export function detectFromFixture(opts: FixtureStillOptions & { riderPresent?: boolean } = {}): BikeDetectOutput {
  const image = renderFixtureStill(opts)
  if (opts.empty) {
    return detectBikeFromPixels(image, { riderPresent: opts.riderPresent })
  }
  if (opts.badPerspective) {
    return detectBikeFromPixels(image, { riderPresent: opts.riderPresent })
  }

  const refs = fixtureRefs()
  const riderPresent = opts.riderPresent ?? Boolean(opts.rider)
  const make = (shiftX: number, id: string): BikeCandidate => {
    const B = { x: refs.B.x + shiftX, y: refs.B.y }
    const S = { x: refs.S.x + shiftX, y: refs.S.y }
    const G = { x: refs.G.x + shiftX, y: refs.G.y }
    const occluded = Boolean(opts.occludeB) && shiftX === 0
    return {
      id,
      region: {
        x: Math.min(S.x, B.x, G.x) - 40,
        y: Math.min(S.y, G.y) - 40,
        width: Math.abs(G.x - S.x) + 80,
        height: Math.abs(B.y - Math.min(S.y, G.y)) + 80,
        facing: 1,
        confidence: 0.9,
      },
      points: {
        B: mark('B', B, {
          occluded,
          uncertain: occluded,
          visibility: occluded ? 0.2 : 0.95,
          confidence: occluded ? 0.32 : 0.9,
        }),
        S: mark('S', S, { confidence: 0.9, visibility: 0.95 }),
        G: mark('G', G, { confidence: 0.88, visibility: 0.93, gripKind: 'bike_ref' }),
      },
      viewQuality: occluded ? 'occluded' : opts.extraBike ? 'multiple' : 'ok',
      message: occluded
        ? 'Tretlager verdeckt — Vorschlag unsicher, nicht stillschweigend bestätigt.'
        : opts.extraBike
          ? 'Mehrere Fahrräder — bitte eines wählen.'
          : 'Fixture-Seitenansicht. Punkte prüfen.',
    }
  }

  const candidates = [make(0, 'bike-1')]
  if (opts.extraBike) candidates.push(make(360, 'bike-2'))

  return {
    version: DETECT_VERSION,
    image: { width: image.width, height: image.height },
    candidates,
    riderPresent,
    perspectiveOk: true,
    message: candidates.length > 1 ? 'Mehrere Fahrräder im Bild. Eines wählen.' : candidates[0]!.message,
  }
}

export { SYNTHETIC_MARKS }
