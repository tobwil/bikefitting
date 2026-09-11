/** Dev/VM fixture: canvas captureStream of a side-view rider. Not a production profile. */

export type SyntheticStreamHandle = {
  stream: MediaStream
  stop: () => void
}

export const SYNTHETIC_WIDTH = 1280
export const SYNTHETIC_HEIGHT = 720
const WIDTH = SYNTHETIC_WIDTH
const HEIGHT = SYNTHETIC_HEIGHT
const FPS = 30

/** Bike marks in the fixture (pixels). Facing +X. */
export const SYNTHETIC_MARKS = {
  B: { x: 580, y: 500 },
  S: { x: 470, y: 330 },
  G: { x: 820, y: 300 },
} as const

export const SYNTHETIC_CRANK_PX = 92
export const SYNTHETIC_CADENCE_RPM = 80

export function syntheticCrankAngleDeg(timestampMs: number): number {
  const degPerMs = (SYNTHETIC_CADENCE_RPM / 60) * 360
  const deg = (timestampMs * degPerMs) / 1000
  return ((deg % 360) + 360) % 360
}

export function syntheticPedalPixel(timestampMs: number): { x: number; y: number } {
  const rad = (syntheticCrankAngleDeg(timestampMs) * Math.PI) / 180
  return {
    x: SYNTHETIC_MARKS.B.x + SYNTHETIC_CRANK_PX * Math.sin(rad),
    y: SYNTHETIC_MARKS.B.y - SYNTHETIC_CRANK_PX * Math.cos(rad),
  }
}

export function drawSyntheticFixture(ctx: CanvasRenderingContext2D, now: number) {
  const { B, S, G } = SYNTHETIC_MARKS
  ctx.fillStyle = '#16130f'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const floor = 620
  ctx.strokeStyle = '#3a342c'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(40, floor)
  ctx.lineTo(WIDTH - 40, floor)
  ctx.stroke()

  ctx.strokeStyle = '#6a5c48'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.arc(360, 500, 118, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(860, 500, 118, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = '#c4a35a'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(B.x, B.y)
  ctx.lineTo(S.x, S.y)
  ctx.lineTo(G.x, G.y)
  ctx.lineTo(B.x, B.y)
  ctx.stroke()

  const pedal = syntheticPedalPixel(now)
  const hip = { x: S.x + 36, y: S.y + 28 }
  const shoulder = { x: G.x - 150, y: G.y - 70 }
  const elbow = { x: G.x - 70, y: G.y - 10 }
  const knee = {
    x: (hip.x + pedal.x) / 2 + 18,
    y: (hip.y + pedal.y) / 2 + 8,
  }

  ctx.strokeStyle = '#e8e0d4'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(shoulder.x, shoulder.y)
  ctx.lineTo(hip.x, hip.y)
  ctx.lineTo(knee.x, knee.y)
  ctx.lineTo(pedal.x, pedal.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(shoulder.x, shoulder.y)
  ctx.lineTo(elbow.x, elbow.y)
  ctx.lineTo(G.x, G.y)
  ctx.stroke()

  ctx.fillStyle = '#e8e0d4'
  ctx.beginPath()
  ctx.arc(shoulder.x + 8, shoulder.y - 28, 16, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#8a7a62'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(B.x, B.y)
  ctx.lineTo(pedal.x, pedal.y)
  ctx.stroke()

  ctx.fillStyle = '#ff2bd6'
  ctx.beginPath()
  ctx.arc(pedal.x, pedal.y, 11, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff6c8'
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.fillStyle = '#9a9184'
  ctx.font = '14px "IBM Plex Mono", monospace'
  ctx.fillText('SYNTHETIC · VM fixture · not a Mac camera', 36, 40)
}

export function createSyntheticStream(): SyntheticStreamHandle {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) {
    throw new Error('Synthetic fixture needs a 2D canvas context.')
  }

  let stopped = false
  let raf = 0
  const started = performance.now()

  const tick = (now: number) => {
    if (stopped) return
    drawSyntheticFixture(ctx, now - started)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const stream =
    typeof canvas.captureStream === 'function'
      ? canvas.captureStream(FPS)
      : new MediaStream()

  if (stream.getVideoTracks().length === 0) {
    throw new Error('Canvas captureStream is not available in this browser.')
  }

  return {
    stream,
    stop() {
      stopped = true
      cancelAnimationFrame(raf)
      for (const track of stream.getTracks()) track.stop()
    },
  }
}
