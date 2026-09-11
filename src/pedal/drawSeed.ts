import type { PixelPoint } from '../types/calibration.ts'
import type { PedalTrackStatus } from '../types/pedal.ts'

export function drawPedalSelection(
  ctx: CanvasRenderingContext2D,
  pixel: PixelPoint | null,
  status: PedalTrackStatus,
): void {
  if (!pixel) return
  ctx.save()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.arc(pixel.x, pixel.y, 15, 0, Math.PI * 2)
  ctx.strokeStyle = status === 'lost' ? '#ffb199' : '#ff2bd6'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2)
  ctx.fillStyle = status === 'lost' ? '#ffb199' : '#fff6c8'
  ctx.fill()
  ctx.restore()
}
