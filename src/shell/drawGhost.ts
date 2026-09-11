import type { PixelPoint } from '../types/calibration.ts'

/** Dashed Soll overlay. Ist stays in pose/drawIst — never fill Ist from this ghost. */
export type OverlayGhost = {
  kind: 'soll'
  segments: Array<[PixelPoint, PixelPoint]>
  points: PixelPoint[]
  label?: string
  stub?: boolean
}

export function drawGhostOverlay(ctx: CanvasRenderingContext2D, ghost: OverlayGhost): void {
  ctx.save()
  ctx.setLineDash([7, 6])
  ctx.strokeStyle = 'rgba(110, 168, 216, 0.88)'
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [a, b] of ghost.segments) {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(186, 216, 238, 0.95)'
  for (const p of ghost.points) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2)
    ctx.fill()
  }
  const label = ghost.label ?? 'Aktuelles Setup'
  ctx.font = '700 15px "Barlow Condensed", sans-serif'
  ctx.fillStyle = '#9ec9e8'
  ctx.textAlign = 'right'
  ctx.fillText(label, ctx.canvas.width - 18, 26)
  ctx.restore()
}
