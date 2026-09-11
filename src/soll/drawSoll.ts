import { SOLL_INFEASIBLE_COPY } from '../types/soll.ts'
import type { SollSolveResult, SollUiState } from '../types/soll.ts'

const CYAN = '#3ee0e8'
const CYAN_DIM = 'rgba(62, 224, 232, 0.16)'
const CYAN_MID = 'rgba(62, 224, 232, 0.45)'

/**
 * Draw Soll on top of the Ist overlay. Does not clear the canvas and does not
 * write Ist landmarks — Ist and Soll stay independent streams.
 */
export function drawSollOverlay(
  ctx: CanvasRenderingContext2D,
  result: SollSolveResult,
  ui: SollUiState,
): void {
  if (result.status === 'insufficient_input') {
    const lost = result.reasons.some((r) => r.code === 'phase_lost')
    if (lost) {
      ctx.fillStyle = 'rgba(18, 17, 15, 0.72)'
      ctx.fillRect(16, 60, 280, 36)
      ctx.fillStyle = CYAN
      ctx.font = '600 16px "Barlow Condensed", sans-serif'
      ctx.fillText('Soll hidden — crank phase lost', 28, 84)
    }
    return
  }

  if (ui.showCorridor && result.hipRegion) {
    ctx.fillStyle = CYAN_DIM
    ctx.strokeStyle = CYAN_MID
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.rect(result.hipRegion.x, result.hipRegion.y, result.hipRegion.w, result.hipRegion.h)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (ui.showCorridor && result.crankCircle) {
    ctx.strokeStyle = CYAN_MID
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.arc(result.crankCircle.center.x, result.crankCircle.center.y, result.crankCircle.radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (result.status === 'timeout') {
    const w = Math.min(420, ctx.canvas.width - 32)
    ctx.fillStyle = 'rgba(18, 17, 15, 0.82)'
    ctx.fillRect(16, ctx.canvas.height - 78, w, 58)
    ctx.strokeStyle = '#c45c3a'
    ctx.lineWidth = 2
    ctx.strokeRect(16, ctx.canvas.height - 78, w, 58)
    ctx.fillStyle = '#ffb199'
    ctx.font = '700 18px "Barlow Condensed", sans-serif'
    ctx.fillText('Soll solver timeout', 28, ctx.canvas.height - 46)
    ctx.fillStyle = '#9a9184'
    ctx.font = '12px "IBM Plex Mono", monospace'
    ctx.fillText('No stretched ghost — retry or check inputs', 28, ctx.canvas.height - 26)
    return
  }

  if (result.status === 'infeasible') {
    const w = Math.min(420, ctx.canvas.width - 32)
    ctx.fillStyle = 'rgba(18, 17, 15, 0.82)'
    ctx.fillRect(16, ctx.canvas.height - 78, w, 58)
    ctx.strokeStyle = '#c45c3a'
    ctx.lineWidth = 2
    ctx.strokeRect(16, ctx.canvas.height - 78, w, 58)
    ctx.fillStyle = '#ffb199'
    ctx.font = '700 18px "Barlow Condensed", sans-serif'
    ctx.fillText(SOLL_INFEASIBLE_COPY, 28, ctx.canvas.height - 46)
    ctx.fillStyle = '#9a9184'
    ctx.font = '12px "IBM Plex Mono", monospace'
    ctx.fillText('current_setup unchanged — bones not stretched', 28, ctx.canvas.height - 26)
    return
  }

  if (result.status !== 'feasible' || !result.skeleton || !ui.showGhost) return

  const { joints, chains } = result.skeleton

  if (ui.showCorridor) {
    ctx.strokeStyle = CYAN_DIM
    ctx.lineWidth = 18
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([])
    for (const chain of chains) {
      ctx.beginPath()
      chain.forEach((id, i) => {
        const p = joints[id]
        if (i === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
    }
  }

  ctx.strokeStyle = CYAN
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([7, 6])
  ctx.shadowColor = 'rgba(62, 224, 232, 0.35)'
  ctx.shadowBlur = 6
  for (const chain of chains) {
    ctx.beginPath()
    chain.forEach((id, i) => {
      const p = joints[id]
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.stroke()
  }
  ctx.shadowBlur = 0
  ctx.setLineDash([])

  ctx.fillStyle = CYAN
  for (const p of Object.values(joints)) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2)
    ctx.fill()
  }
}
