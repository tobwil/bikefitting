import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { IST_CHAIN } from '../types/landmarks.ts'
import type { BikeCalibration, PixelBikeTransform, PixelPoint } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import { inferNearSide, visibleChainPoints, visibleChainSegments } from './nearSide.ts'

export function landmarkToPixel(
  lm: { x: number; y: number },
  width: number,
  height: number,
): PixelPoint {
  return { x: lm.x * width, y: lm.y * height }
}

export function drawIstOverlay(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame | null,
  calibration: BikeCalibration,
  transform: PixelBikeTransform | null,
  pedal: PedalSample | null,
): void {
  const { width, height } = ctx.canvas
  ctx.clearRect(0, 0, width, height)

  if (frame && frame.landmarks.length > 0) {
    const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#f0c36a'
    ctx.lineWidth = 3.5
    ctx.shadowColor = 'rgba(196, 163, 90, 0.45)'
    ctx.shadowBlur = 8
    for (const chain of [IST_CHAIN.arm, IST_CHAIN.leg]) {
      for (const [a, b] of visibleChainSegments(frame.landmarks, near, chain, MIN_LANDMARK_VISIBILITY)) {
        const pa = landmarkToPixel(a, width, height)
        const pb = landmarkToPixel(b, width, height)
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }
    }
    ctx.shadowBlur = 0
    ctx.fillStyle = '#fff4d2'
    for (const chain of [IST_CHAIN.arm, IST_CHAIN.leg]) {
      for (const p of visibleChainPoints(frame.landmarks, near, chain, MIN_LANDMARK_VISIBILITY)) {
        const pix = landmarkToPixel(p, width, height)
        ctx.beginPath()
        ctx.arc(pix.x, pix.y, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (transform) {
    const o = transform.originPx
    ctx.lineWidth = 2
    ctx.strokeStyle = '#7ec8a3'
    ctx.beginPath()
    ctx.moveTo(o.x, o.y)
    ctx.lineTo(o.x + 90 * transform.forwardPx.x, o.y + 90 * transform.forwardPx.y)
    ctx.stroke()
    ctx.strokeStyle = '#6ea8d8'
    ctx.beginPath()
    ctx.moveTo(o.x, o.y)
    ctx.lineTo(o.x + 70 * transform.upPx.x, o.y + 70 * transform.upPx.y)
    ctx.stroke()
    ctx.fillStyle = '#7ec8a3'
    ctx.font = '12px "IBM Plex Mono", monospace'
    ctx.fillText(`+x face ${transform.facing > 0 ? '→' : '←'}`, o.x + 8, o.y - 12)
    ctx.fillStyle = '#6ea8d8'
    ctx.fillText('+y up', o.x + 8, o.y - 28)
  }

  const labels: Array<{ id: 'B' | 'S' | 'G'; color: string }> = [
    { id: 'B', color: '#e8e0d4' },
    { id: 'S', color: '#c4a35a' },
    { id: 'G', color: '#d47a4a' },
  ]
  for (const { id, color } of labels) {
    const mark = calibration.marks[id]
    if (!mark) continue
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(mark.x, mark.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#12110f'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.font = '700 13px "Barlow Condensed", sans-serif'
    ctx.fillStyle = color
    ctx.fillText(id, mark.x + 10, mark.y - 8)
  }

  if (pedal?.status === 'lost') {
    ctx.fillStyle = 'rgba(196, 92, 58, 0.92)'
    ctx.fillRect(16, 16, 132, 36)
    ctx.fillStyle = '#fff4ee'
    ctx.font = '700 22px "Barlow Condensed", sans-serif'
    ctx.fillText('LOST', 48, 42)
  } else if (pedal?.pixel) {
    ctx.strokeStyle = '#ff2bd6'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(pedal.pixel.x, pedal.pixel.y, 14, 0, Math.PI * 2)
    ctx.stroke()
  }
}
