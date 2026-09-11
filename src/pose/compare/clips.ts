import { drawSyntheticFixture, SYNTHETIC_HEIGHT, SYNTHETIC_WIDTH } from '../../camera/synthetic.ts'
import { fileFixtureClip, FILE_FIXTURE_ID } from '../../file/fixture.ts'
import { classifyLocalFile } from '../../file/classify.ts'
import { syntheticPoseFrame } from '../syntheticLandmarks.ts'
import type { Landmark } from '../../types/landmarks.ts'
import type { PoseCompareClip, PoseCompareFrame, PoseComparePixels } from '../../types/pose-compare.ts'

export const ANNOTATION_KIND = 'bikefit.pose-annotation.v1'

const DEFAULT_SYNTHETIC_FRAMES = 24
const DEFAULT_DT_MS = 1000 / 15

export function syntheticCompareClip(frames = DEFAULT_SYNTHETIC_FRAMES, dtMs = DEFAULT_DT_MS): PoseCompareClip {
  const out: PoseCompareFrame[] = []
  for (let i = 0; i < frames; i += 1) {
    const timestampMs = i * dtMs
    const pose = syntheticPoseFrame(timestampMs)
    out.push({
      timestampMs,
      width: SYNTHETIC_WIDTH,
      height: SYNTHETIC_HEIGHT,
      truth: pose.landmarks,
    })
  }
  return {
    kind: 'synthetic',
    name: 'synthetic-fixture-clip',
    width: SYNTHETIC_WIDTH,
    height: SYNTHETIC_HEIGHT,
    frames: out,
    annotated: true,
    localOnly: true,
    simulation: true,
  }
}

/** File-replay fixture (in-process synthetic crank). Used as the VM file-clip compare. */
export function fileFixtureCompareClip(): PoseCompareClip {
  const clip = fileFixtureClip(2)
  return {
    kind: 'file',
    name: FILE_FIXTURE_ID,
    width: clip[0]?.pose?.videoWidth ?? 1280,
    height: clip[0]?.pose?.videoHeight ?? 720,
    frames: clip.map((frame) => ({
      timestampMs: frame.mediaTimeMs,
      width: frame.pose?.videoWidth ?? 1280,
      height: frame.pose?.videoHeight ?? 720,
      truth: frame.pose?.landmarks,
    })),
    annotated: true,
    localOnly: true,
    simulation: true,
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAnnotationPixels(value: unknown): PoseComparePixels | { error: string } | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) return { error: 'Frame-Pixel müssen ein Objekt sein.' }
  if (typeof value.width !== 'number' || typeof value.height !== 'number') {
    return { error: 'Frame-Pixel brauchen width/height.' }
  }
  if (!Array.isArray(value.data)) return { error: 'Frame-Pixel brauchen data[].' }
  const expected = value.width * value.height * 4
  if (value.data.length !== expected) {
    return { error: `Frame-Pixel data hat ${value.data.length} Werte, erwartet ${expected}.` }
  }
  const data = new Uint8ClampedArray(expected)
  for (let i = 0; i < expected; i += 1) {
    const n = value.data[i]
    if (typeof n !== 'number' || !Number.isFinite(n)) return { error: 'Frame-Pixel data muss Zahlen enthalten.' }
    data[i] = n
  }
  return { width: value.width, height: value.height, data }
}

export function parseAnnotatedSequence(raw: unknown): PoseCompareClip | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Annotierte Sequenz muss ein Objekt sein.' }
  const value = raw as Record<string, unknown>
  if (value.kind !== ANNOTATION_KIND) {
    return { error: `Unbekanntes Schema (erwartet ${ANNOTATION_KIND}).` }
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    return { error: 'Annotierte Sequenz hat keine Frames.' }
  }
  const width = typeof value.width === 'number' ? value.width : 0
  const height = typeof value.height === 'number' ? value.height : 0
  const frames: PoseCompareFrame[] = []
  for (const entry of value.frames) {
    if (!entry || typeof entry !== 'object') return { error: 'Frame ungültig.' }
    const row = entry as Record<string, unknown>
    if (typeof row.timestampMs !== 'number' || !Array.isArray(row.landmarks)) {
      return { error: 'Frame braucht timestampMs und landmarks.' }
    }
    const landmarks: Landmark[] = []
    for (const lm of row.landmarks) {
      if (!lm || typeof lm !== 'object') return { error: 'Landmark ungültig.' }
      const p = lm as Record<string, unknown>
      if (typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') {
        return { error: 'Landmark braucht x/y/z.' }
      }
      landmarks.push({
        x: p.x,
        y: p.y,
        z: p.z,
        visibility: typeof p.visibility === 'number' ? p.visibility : 0,
      })
    }
    const pixels = parseAnnotationPixels(row.pixels)
    if (pixels && 'error' in pixels) return pixels
    frames.push({
      timestampMs: row.timestampMs,
      width: typeof row.width === 'number' ? row.width : width,
      height: typeof row.height === 'number' ? row.height : height,
      truth: landmarks,
      ...(pixels ? { pixels } : {}),
    })
  }
  const bound = frames.length > 0 && frames.every((frame) => Boolean(frame.pixels))
  return {
    kind: 'annotated',
    name: typeof value.name === 'string' ? value.name : 'annotated-sequence',
    width: width || frames[0]?.width || 0,
    height: height || frames[0]?.height || 0,
    frames,
    annotated: true,
    localOnly: true,
    simulation: !bound,
  }
}

export function pixelsFromCanvas(canvas: HTMLCanvasElement): PoseComparePixels | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { width: image.width, height: image.height, data: image.data }
}

export function clipFramesHavePixels(clip: Pick<PoseCompareClip, 'frames'>): boolean {
  return clip.frames.length > 0 && clip.frames.every((frame) => Boolean(frame.pixels))
}

export function pixelsByteIdentical(a?: PoseComparePixels, b?: PoseComparePixels): boolean {
  if (!a || !b) return false
  if (a.width !== b.width || a.height !== b.height) return false
  if (a.data.length !== b.data.length) return false
  for (let i = 0; i < a.data.length; i += 1) {
    if (a.data[i] !== b.data[i]) return false
  }
  return true
}

export function clipIsSimulation(clip: PoseCompareClip): boolean {
  if (clip.simulation === true) return true
  if (clip.kind === 'synthetic') return true
  if (clip.simulation === false && clipFramesHavePixels(clip)) return false
  return !clipFramesHavePixels(clip)
}

/**
 * Draw the cartoon fixture into pixel buffers so Lite and Full see the same clip.
 * Only for explicit synthetic fixtures — never overwrite imported file pixels.
 */
export function paintSyntheticClip(clip: PoseCompareClip): PoseCompareClip {
  if (clip.kind !== 'synthetic') return clip
  if (typeof document === 'undefined') return { ...clip, simulation: true }
  const canvas = document.createElement('canvas')
  canvas.width = clip.width
  canvas.height = clip.height
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  if (!ctx) return { ...clip, simulation: true }
  return {
    ...clip,
    simulation: true,
    frames: clip.frames.map((frame) => {
      if (frame.pixels) return frame
      drawSyntheticFixture(ctx, frame.timestampMs)
      const pixels = pixelsFromCanvas(canvas)
      return pixels ? { ...frame, pixels } : frame
    }),
  }
}

const MISSING_PIXELS_ERROR =
  'Annotierte oder importierte Clips brauchen Bilddaten. JSON nur mit Landmarks ist keine echte Ground-Truth. Synthetic wird nicht über Datei-Pixel gemalt.'

/** Paint synthetic fixtures only. Pass imported pixels through unchanged. */
export function prepareCompareClip(
  clip: PoseCompareClip,
  mode: 'injected' | 'mediapipe',
): PoseCompareClip | { error: string } {
  if (clip.kind === 'synthetic') {
    return paintSyntheticClip(clip)
  }
  if (clipFramesHavePixels(clip)) {
    return { ...clip, simulation: false }
  }
  if (mode === 'mediapipe') {
    return { error: MISSING_PIXELS_ERROR }
  }
  return { ...clip, simulation: true }
}

export async function bitmapFromPixels(pixels: PoseComparePixels): Promise<ImageBitmap> {
  const copy = new Uint8ClampedArray(pixels.data)
  const image = new ImageData(copy, pixels.width, pixels.height)
  return createImageBitmap(image)
}

export async function extractLocalFileClip(
  file: File,
  opts: { maxFrames?: number; fps?: number } = {},
): Promise<PoseCompareClip | { error: string }> {
  if (file.name.toLowerCase().endsWith('.json')) {
    try {
      const text = await file.text()
      return parseAnnotatedSequence(JSON.parse(text))
    } catch {
      return { error: 'JSON-Annotation konnte nicht gelesen werden.' }
    }
  }
  const classified = classifyLocalFile(file)
  if (!classified.ok) return { error: classified.error }

  if (typeof document === 'undefined') {
    return { error: 'Datei-Frames brauchen einen Browser. Auf der VM: Synthetic- oder File-Fixture-Clip.' }
  }

  const url = URL.createObjectURL(file)
  try {
    if (classified.kind === 'image') {
      const image = await loadImage(url)
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return { error: 'Canvas nicht verfügbar.' }
      ctx.drawImage(image, 0, 0)
      const pixels = pixelsFromCanvas(canvas)
      return {
        kind: 'file',
        name: file.name,
        width: canvas.width,
        height: canvas.height,
        frames: [
          {
            timestampMs: 0,
            width: canvas.width,
            height: canvas.height,
            pixels: pixels ?? undefined,
          },
        ],
        annotated: false,
        localOnly: true,
        simulation: false,
      }
    }
    return await extractVideoClip(url, file.name, opts)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'))
    image.src = url
  })
}

async function extractVideoClip(
  url: string,
  name: string,
  opts: { maxFrames?: number; fps?: number },
): Promise<PoseCompareClip | { error: string }> {
  const maxFrames = opts.maxFrames ?? 24
  const fps = opts.fps ?? 8
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Video konnte nicht geladen werden.'))
  })
  const duration = Number.isFinite(video.duration) ? video.duration : 0
  const width = video.videoWidth
  const height = video.videoHeight
  if (width < 2 || height < 2) return { error: 'Video hat keine gültige Größe.' }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { error: 'Canvas nicht verfügbar.' }

  const step = 1 / fps
  const frames: PoseCompareFrame[] = []
  let t = 0
  while (frames.length < maxFrames && (duration === 0 || t <= duration + 1e-3)) {
    await seekVideo(video, t)
    ctx.drawImage(video, 0, 0, width, height)
    const pixels = pixelsFromCanvas(canvas)
    frames.push({
      timestampMs: Math.round(t * 1000),
      width,
      height,
      pixels: pixels ?? undefined,
    })
    t += step
    if (duration === 0) break
  }
  return {
    kind: 'file',
    name,
    width,
    height,
    frames,
    annotated: false,
    localOnly: true,
    simulation: false,
  }
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    try {
      video.currentTime = timeSec
    } catch {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
  })
}
