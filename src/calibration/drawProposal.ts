import type { BikeMarkId } from '../types/calibration.ts'
import { markOverlayLabel } from './marks.ts'
import { pointStatusLabel } from './statusCopy.ts'
import { selectedPoints, selectedRegion, type DetectSession } from './propose.ts'

const COLORS: Record<BikeMarkId, string> = {
  B: '#e8e0d4',
  S: '#c4a35a',
  G: '#d47a4a',
}

export function drawProposal(
  ctx: CanvasRenderingContext2D,
  session: DetectSession,
  opts: { labelStatus?: boolean } = {},
): void {
  const region = selectedRegion(session)
  const points = selectedPoints(session)
  if (!region && !points) return

  if (region) {
    ctx.save()
    ctx.strokeStyle = 'rgba(196, 163, 90, 0.85)'
    ctx.setLineDash([8, 5])
    ctx.lineWidth = 2
    ctx.strokeRect(region.x, region.y, region.width, region.height)
    ctx.setLineDash([])
    ctx.font = '700 13px "Barlow Condensed", sans-serif'
    ctx.fillStyle = '#c4a35a'
    const face = region.facing === -1 ? '← Heck vorne' : region.facing === 1 ? '→ Front rechts' : 'Seite unklar'
    ctx.fillText(`Fahrrad ${face}`, region.x + 8, region.y + 18)
    ctx.restore()
  }

  if (!points) return
  for (const id of ['B', 'S', 'G'] as const) {
    const mark = points[id]
    if (!mark) continue
    const color = COLORS[id]
    ctx.beginPath()
    ctx.arc(mark.pixel.x, mark.pixel.y, mark.uncertain ? 10 : 8, 0, Math.PI * 2)
    ctx.fillStyle = mark.uncertain ? 'rgba(196, 92, 58, 0.35)' : color
    ctx.fill()
    ctx.lineWidth = mark.status === 'proposed' ? 2 : 3
    ctx.strokeStyle = mark.status === 'corrected' ? '#7ec8a3' : '#12110f'
    ctx.setLineDash(mark.status === 'proposed' ? [3, 3] : [])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = '700 13px "Barlow Condensed", sans-serif'
    ctx.fillStyle = color
    const label = opts.labelStatus === false ? markOverlayLabel(id) : `${markOverlayLabel(id)} · ${pointStatusLabel(mark.status)}`
    ctx.fillText(label, mark.pixel.x + 12, mark.pixel.y - 10)
  }
}
