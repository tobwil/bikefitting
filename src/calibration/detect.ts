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
import { createPixelImage, type PixelImage } from './pixels.ts'

/** Local color/silhouette prototype — not a trained bike model, not frame-detect-done. */
export const DETECT_VERSION: BikeDetectVersion = {
  detector: BIKE_DETECT_DETECTOR,
  model: 'local-prototype',
}

export type DetectSource = 'camera' | 'synthetic' | 'unknown'

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
  prototype: true
  source: DetectSource
}

export type DetectProgressFn = (progress: number, message?: string) => void

export type DetectBikeOptions = {
  riderPresent?: boolean
  source?: DetectSource
  onProgress?: DetectProgressFn
  shouldCancel?: () => boolean
}

const GOLD_MIN = 40
const DETECT_MAX_EDGE = 480
const GOLD_POINT_CAP = 2400
/** Filled color blobs (gold rectangles) are not bike frames. */
const BLOB_DENSITY_REJECT = 0.28
const PROTOTYPE_LABEL = 'Experimenteller Geometrie-Prototyp — keine allgemeine Fahrraderkennung.'

function isGold(r: number, g: number, b: number): boolean {
  return r > 150 && g > 110 && b < 130 && r - b > 40 && r >= g
}

function cancelled(opts?: DetectBikeOptions): boolean {
  return Boolean(opts?.shouldCancel?.())
}

/**
 * Cap working resolution. Coordinates are later mapped back to the original still.
 */
export function downsampleDetectImage(
  image: PixelImage,
  maxEdge = DETECT_MAX_EDGE,
): { image: PixelImage; scaleX: number; scaleY: number } {
  const edge = Math.max(image.width, image.height)
  if (edge <= maxEdge) return { image, scaleX: 1, scaleY: 1 }
  const scale = edge / maxEdge
  const w = Math.max(1, Math.round(image.width / scale))
  const h = Math.max(1, Math.round(image.height / scale))
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y * scale))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x * scale))
      const si = (sy * image.width + sx) * 4
      const di = (y * w + x) * 4
      data[di] = image.data[si]!
      data[di + 1] = image.data[si + 1]!
      data[di + 2] = image.data[si + 2]!
      data[di + 3] = image.data[si + 3]!
    }
  }
  return { image: { width: w, height: h, data }, scaleX: image.width / w, scaleY: image.height / h }
}

function capGoldPoints(pts: PixelPoint[]): PixelPoint[] {
  if (pts.length <= GOLD_POINT_CAP) return pts
  const stride = Math.ceil(pts.length / GOLD_POINT_CAP)
  const out: PixelPoint[] = []
  for (let i = 0; i < pts.length; i += stride) out.push(pts[i]!)
  return out
}

export function collectGold(image: PixelImage): PixelPoint[] {
  const pts: PixelPoint[] = []
  const { width, height, data } = image
  const step = Math.max(1, Math.ceil(Math.max(width, height) / DETECT_MAX_EDGE))
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      if (isGold(data[i]!, data[i + 1]!, data[i + 2]!)) pts.push({ x, y })
    }
  }
  return capGoldPoints(pts)
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

/**
 * Color-filled rectangle/blob — not a sparse frame. Samples the image so a
 * point-cap cannot hide a solid gold rectangle as a “low density” cluster.
 * Color alone is not identity.
 */
export function isFilledGoldBlob(image: PixelImage, box: BikeRegion): boolean {
  const step = Math.max(1, Math.floor(Math.min(box.width, box.height) / 24))
  let gold = 0
  let total = 0
  const { width, height, data } = image
  const x1 = Math.min(width - 1, Math.ceil(box.x + box.width))
  const y1 = Math.min(height - 1, Math.ceil(box.y + box.height))
  for (let y = Math.max(0, Math.floor(box.y)); y <= y1; y += step) {
    for (let x = Math.max(0, Math.floor(box.x)); x <= x1; x += step) {
      total += 1
      const i = (y * width + x) * 4
      if (isGold(data[i]!, data[i + 1]!, data[i + 2]!)) gold += 1
    }
  }
  return total > 0 && gold / total > BLOB_DENSITY_REJECT
}

function clusterGold(pts: PixelPoint[]): PixelPoint[][] {
  if (pts.length === 0) return []
  const box = bboxOf(pts)
  if (!box) return []
  if (box.width < 80) return [pts]

  const mid = box.x + box.width / 2
  const left: PixelPoint[] = []
  const right: PixelPoint[] = []
  for (const p of pts) {
    if (p.x < mid) left.push(p)
    else right.push(p)
  }
  const leftBox = bboxOf(left)
  const rightBox = bboxOf(right)
  const gap = leftBox && rightBox ? rightBox.x - (leftBox.x + leftBox.width) : 0
  if (left.length > GOLD_MIN && right.length > GOLD_MIN && gap > 80) {
    return [left, right]
  }
  return [pts]
}

export function mean(pts: PixelPoint[]): PixelPoint {
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

function goldInDisk(image: PixelImage, cx: number, cy: number, radius: number): { gold: number; total: number } {
  const r = Math.ceil(radius)
  let gold = 0
  let total = 0
  const { width, height, data } = image
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(width - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(height - 1, Math.ceil(cy + r))
  const r2 = radius * radius
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy > r2) continue
      total += 1
      const i = (y * width + x) * 4
      if (isGold(data[i]!, data[i + 1]!, data[i + 2]!)) gold += 1
    }
  }
  return { gold, total }
}

function assessBottomVisibility(
  image: PixelImage,
  pixel: PixelPoint,
): { occluded: boolean; uncertain: boolean } {
  const core = goldInDisk(image, pixel.x, pixel.y, 5)
  // Geometry (a proposed B) is not visibility. A hole at the vertex stays uncertain.
  if (core.gold < 4) return { occluded: true, uncertain: true }
  return { occluded: false, uncertain: false }
}

function bottomCluster(pts: PixelPoint[]): PixelPoint {
  const floor = quantileY(pts, 0.95)
  const low: PixelPoint[] = []
  for (const p of pts) {
    if (p.y >= floor) low.push(p)
  }
  if (low.length < 4) {
    let fallback = pts[0]!
    for (const p of pts) {
      if (p.y > fallback.y) fallback = p
    }
    return fallback
  }
  return mean(low)
}

/**
 * Bottom-band midpoint. A visible vertex is gold there; a covered crank axis
 * leaves a hole between the two remaining lower arms.
 */
function lowerVertexProbe(pts: PixelPoint[]): PixelPoint {
  let maxY = -Infinity
  for (const p of pts) {
    if (p.y > maxY) maxY = p.y
  }
  const band = Math.max(10, (maxY - quantileY(pts, 0.5)) * 0.12)
  let minX = Infinity
  let maxX = -Infinity
  let n = 0
  let sx = 0
  for (const p of pts) {
    if (p.y < maxY - band) continue
    n += 1
    sx += p.x
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
  }
  if (n === 0) return bottomCluster(pts)
  return { x: (minX + maxX) / 2, y: maxY }
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
  const midX = mean(pts).x
  const front = pts.filter((p) => (facing === 1 ? p.x >= midX : p.x <= midX))
  if (front.length === 0) return null
  const ranked = [...front].sort((a, b) => (facing === 1 ? b.x - a.x : a.x - b.x))
  const tip = ranked.slice(0, Math.max(10, Math.floor(ranked.length * 0.08)))
  return mean(tip)
}

/**
 * O(N): centroid once, then one extrema pass. No spread-min on large arrays.
 */
export function guessFacing(pts: PixelPoint[]): BikeFacing {
  const c = mean(pts)
  let leftTop = Infinity
  let rightTop = Infinity
  for (const p of pts) {
    if (p.x <= c.x) {
      if (p.y < leftTop) leftTop = p.y
    } else if (p.y < rightTop) {
      rightTop = p.y
    }
  }
  return rightTop <= leftTop ? 1 : -1
}

function facingOf(s: PixelPoint, g: PixelPoint): BikeFacing | null {
  const dx = g.x - s.x
  if (Math.abs(dx) < 12) return null
  return dx > 0 ? 1 : -1
}

function prototypeConfidence(source: DetectSource): number {
  if (source === 'camera') return 0.2
  return 0.45
}

function withPrototypeCopy(message: string, source: DetectSource): string {
  if (source === 'camera') {
    return `${PROTOTYPE_LABEL} ${message} Bitte manuell setzen oder skeptisch prüfen — ohne Vertrauenswert.`
  }
  return `${PROTOTYPE_LABEL} ${message}`
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
    confidence: extras.confidence ?? 0.45,
    occluded: extras.occluded ?? false,
    uncertain: extras.uncertain ?? false,
    status: extras.status ?? 'proposed',
    origin: extras.origin ?? 'auto',
    gripKind: extras.gripKind,
  }
}

function scalePoint(p: PixelPoint, sx: number, sy: number): PixelPoint {
  return { x: p.x * sx, y: p.y * sy }
}

function scaleMark(m: DetectedMark | null, sx: number, sy: number): DetectedMark | null {
  if (!m) return null
  return { ...m, pixel: scalePoint(m.pixel, sx, sy) }
}

function scaleCandidate(c: BikeCandidate, sx: number, sy: number): BikeCandidate {
  if (sx === 1 && sy === 1) return c
  return {
    ...c,
    region: {
      ...c.region,
      x: c.region.x * sx,
      y: c.region.y * sy,
      width: c.region.width * sx,
      height: c.region.height * sy,
    },
    points: {
      B: scaleMark(c.points.B, sx, sy),
      S: scaleMark(c.points.S, sx, sy),
      G: scaleMark(c.points.G, sx, sy),
    },
  }
}

function candidateFromCluster(
  id: string,
  pts: PixelPoint[],
  image: PixelImage,
  riderPresent: boolean,
  source: DetectSource,
): BikeCandidate | null {
  const region = bboxOf(pts)
  if (!region || pts.length < GOLD_MIN) return null

  const proto = prototypeConfidence(source)
  const aspect = region.height / Math.max(1, region.width)
  if (region.width < 40 || region.height < 18) {
    return {
      id,
      region: { ...region, confidence: proto * 0.4 },
      points: { B: null, S: null, G: null },
      viewQuality: 'bad_perspective',
      message: withPrototypeCopy(
        'Seitenansicht ungeeignet — Fahrrad neu ausrichten. Keine Millimeter aus einer flachen Ansicht.',
        source,
      ),
    }
  }
  if (aspect < 0.22) {
    return {
      id,
      region: { ...region, confidence: proto * 0.5, facing: null },
      points: { B: null, S: null, G: null },
      viewQuality: 'bad_perspective',
      message: withPrototypeCopy(
        'Perspektive zu flach. Kamera auf Höhe der Tretlager-Mitte, echte Seitenansicht.',
        source,
      ),
    }
  }

  if (isFilledGoldBlob(image, region)) {
    return null
  }

  const facingGuess = guessFacing(pts)
  const S = saddleTop(pts, facingGuess)
  const G = S ? hoods(pts, facingGuess) : null
  const facing = S && G ? facingOf(S, G) ?? facingGuess : null
  const probe = lowerVertexProbe(pts)
  const vis = assessBottomVisibility(image, probe)
  const bbPixel = vis.occluded ? probe : bottomCluster(pts)
  if (!S || !G || !facing) {
    return {
      id,
      region: { ...region, facing, confidence: proto * 0.6 },
      points: {
        B: null,
        S: S ? mark('S', S, { confidence: proto * 0.8, uncertain: true }) : null,
        G: null,
      },
      viewQuality: 'ambiguous',
      message: withPrototypeCopy('Kalibrierpunkte unklar. Manuell setzen.', source),
    }
  }

  region.facing = facing
  region.confidence = proto
  const pad = 28
  region.x = Math.max(0, region.x - pad)
  region.y = Math.max(0, region.y - pad)
  region.width = Math.min(image.width - region.x, region.width + pad * 2)
  region.height = Math.min(image.height - region.y, region.height + pad * 2)

  const B = mark('B', bbPixel, {
    occluded: vis.occluded,
    uncertain: vis.uncertain,
    visibility: vis.occluded ? 0.2 : 0.7,
    confidence: vis.occluded ? proto * 0.5 : proto,
  })
  const saddle = mark('S', S, { confidence: proto, visibility: 0.75 })
  const grip = mark('G', G, {
    confidence: riderPresent ? proto * 0.85 : proto,
    visibility: 0.7,
    gripKind: 'bike_ref',
    uncertain: false,
  })

  return {
    id,
    region,
    points: { B, S: saddle, G: grip },
    viewQuality: vis.occluded ? 'occluded' : 'ok',
    message: vis.occluded
      ? withPrototypeCopy('Tretlager verdeckt — Vorschlag unsicher, nicht stillschweigend bestätigt.', source)
      : withPrototypeCopy('Vorschläge prüfen, nicht als fertig annehmen.', source),
  }
}

function emptyDetect(
  image: { width: number; height: number },
  riderPresent: boolean,
  source: DetectSource,
  message: string,
): BikeDetectOutput {
  return {
    version: DETECT_VERSION,
    image,
    candidates: [],
    riderPresent,
    perspectiveOk: false,
    message: withPrototypeCopy(message, source),
    prototype: true,
    source,
  }
}

/**
 * Local geometry prototype. Person pose is not bike calibration.
 * Finding a "bicycle" class label is not success — B/S/G must be proposed.
 * Color alone does not define object identity or confidence.
 */
export function detectBikeFromPixels(image: PixelImage, opts: DetectBikeOptions = {}): BikeDetectOutput {
  const riderPresent = opts.riderPresent ?? false
  const source = opts.source ?? 'unknown'
  opts.onProgress?.(0.05, 'Standbild lesen…')
  if (cancelled(opts)) return emptyDetect(image, riderPresent, source, 'Erkennung abgebrochen. Manuell setzen.')

  const scaled = downsampleDetectImage(image)
  opts.onProgress?.(0.25, 'Farbcluster…')
  if (cancelled(opts)) return emptyDetect(image, riderPresent, source, 'Erkennung abgebrochen. Manuell setzen.')

  const gold = collectGold(scaled.image)
  if (gold.length < GOLD_MIN) {
    return emptyDetect(
      { width: image.width, height: image.height },
      riderPresent,
      source,
      'Kein Rahmen-Prototyp in der Seitenansicht. Manuell kalibrieren — nichts blockiert.',
    )
  }

  opts.onProgress?.(0.55, 'Silhouette…')
  if (cancelled(opts)) return emptyDetect(image, riderPresent, source, 'Erkennung abgebrochen. Manuell setzen.')

  const clusters = clusterGold(gold)
  const candidates = clusters
    .map((pts, i) => candidateFromCluster(`bike-${i + 1}`, pts, scaled.image, riderPresent, source))
    .filter((c): c is BikeCandidate => Boolean(c))
    .map((c) => scaleCandidate(c, scaled.scaleX, scaled.scaleY))

  opts.onProgress?.(0.9, 'Vorschläge…')

  if (candidates.length === 0) {
    return emptyDetect(
      { width: image.width, height: image.height },
      riderPresent,
      source,
      'Keine fahrradähnliche Silhouette. Goldfläche allein gilt nicht. Manuell setzen.',
    )
  }

  if (candidates.length > 1) {
    for (const c of candidates) {
      c.viewQuality = c.viewQuality === 'ok' ? 'multiple' : c.viewQuality
      c.message = withPrototypeCopy('Mehrere Kandidaten — bitte eines wählen.', source)
    }
  }

  const perspectiveOk = candidates.some(
    (c) => c.viewQuality === 'ok' || c.viewQuality === 'occluded' || c.viewQuality === 'multiple',
  )
  return {
    version: DETECT_VERSION,
    image: { width: image.width, height: image.height },
    candidates,
    riderPresent,
    perspectiveOk,
    prototype: true,
    source,
    message:
      candidates.length > 1
        ? withPrototypeCopy('Mehrere Kandidaten im Bild. Eines wählen, dann Punkte prüfen.', source)
        : (candidates[0]?.message ?? withPrototypeCopy('Vorschläge prüfen.', source)),
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
    prototype: true,
    source: 'unknown',
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

/** Fixture path for VM / harness: known refs as proposals, same confirm contract. Separate from pixel detect. */
export function detectFromFixture(opts: FixtureStillOptions & { riderPresent?: boolean } = {}): BikeDetectOutput {
  const image = renderFixtureStill(opts)
  if (opts.empty) {
    return detectBikeFromPixels(image, { riderPresent: opts.riderPresent, source: 'synthetic' })
  }
  if (opts.badPerspective) {
    return detectBikeFromPixels(image, { riderPresent: opts.riderPresent, source: 'synthetic' })
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
        confidence: 0.45,
      },
      points: {
        B: mark('B', B, {
          occluded,
          uncertain: occluded,
          visibility: occluded ? 0.2 : 0.75,
          confidence: occluded ? 0.22 : 0.45,
        }),
        S: mark('S', S, { confidence: 0.45, visibility: 0.75 }),
        G: mark('G', G, { confidence: 0.45, visibility: 0.7, gripKind: 'bike_ref' }),
      },
      viewQuality: occluded ? 'occluded' : opts.extraBike ? 'multiple' : 'ok',
      message: occluded
        ? withPrototypeCopy('Tretlager verdeckt — Vorschlag unsicher, nicht stillschweigend bestätigt.', 'synthetic')
        : opts.extraBike
          ? withPrototypeCopy('Mehrere Kandidaten — bitte eines wählen.', 'synthetic')
          : withPrototypeCopy('Fixture-Oberfläche (bekannte Refs). Punkte prüfen.', 'synthetic'),
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
    prototype: true,
    source: 'synthetic',
    message: candidates.length > 1 ? candidates[1]!.message : candidates[0]!.message,
  }
}

/** Harness helper: solid gold rectangle in original coordinates. */
export function renderGoldRectangle(width: number, height: number, rectW: number, rectH: number): PixelImage {
  const image = createPixelImage(width, height, [22, 19, 15, 255])
  const x0 = Math.max(0, Math.floor((width - rectW) / 2))
  const y0 = Math.max(0, Math.floor((height - rectH) / 2))
  for (let y = y0; y < y0 + rectH && y < height; y++) {
    for (let x = x0; x < x0 + rectW && x < width; x++) {
      const i = (y * width + x) * 4
      image.data[i] = 196
      image.data[i + 1] = 163
      image.data[i + 2] = 90
      image.data[i + 3] = 255
    }
  }
  return image
}

/** Harness helper: translate pixels. New still, same canvas size. */
export function shiftPixelImage(image: PixelImage, dx: number, dy = 0): PixelImage {
  const out = createPixelImage(image.width, image.height, [22, 19, 15, 255])
  for (let y = 0; y < image.height; y++) {
    const sy = y - dy
    if (sy < 0 || sy >= image.height) continue
    for (let x = 0; x < image.width; x++) {
      const sx = x - dx
      if (sx < 0 || sx >= image.width) continue
      const si = (sy * image.width + sx) * 4
      const di = (y * image.width + x) * 4
      out.data[di] = image.data[si]!
      out.data[di + 1] = image.data[si + 1]!
      out.data[di + 2] = image.data[si + 2]!
      out.data[di + 3] = image.data[si + 3]!
    }
  }
  return out
}

export { SYNTHETIC_MARKS }
