import type { BikeCalibration } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { PhaseId, PhaseImage } from '../types/phase.ts'
import { PHASE_TARGET_DEG } from '../types/phase.ts'
import { drawIstOverlay } from '../pose/drawIst.ts'
import { PHASE_LABEL_DE } from './phaseFrames.ts'

export const PHASE_JPEG_MAX_WIDTH = 640
export const PHASE_JPEG_QUALITY = 0.72

export type EncodePhaseStillInput = {
  source: CanvasImageSource
  sourceWidth: number
  sourceHeight: number
  pose: PoseFrame | null
  calibration: BikeCalibration
  pedal: PedalSample | null
  phaseId: PhaseId
  crankAngleDeg: number
  side: string
  timestampMs: number
  frameKneeDeg: number | null
  maxWidth?: number
  quality?: number
}

/**
 * Bake video + Ist landmarks + B/S/G + crank caption into a local JPEG.
 * Overlay uses the supplied calibration snapshot, not live state later.
 */
export function encodePhaseStill(input: EncodePhaseStillInput): PhaseImage | null {
  if (typeof document === 'undefined') return null
  const srcW = input.sourceWidth
  const srcH = input.sourceHeight
  if (srcW < 2 || srcH < 2) return null

  const full = document.createElement('canvas')
  full.width = srcW
  full.height = srcH
  const fctx = full.getContext('2d')
  if (!fctx) return null
  try {
    fctx.drawImage(input.source, 0, 0, srcW, srcH)
  } catch {
    return null
  }
  drawIstOverlay(fctx, input.pose, input.calibration, input.calibration.transform, input.pedal, {
    clear: false,
  })
  paintPhaseCaption(fctx, input)

  const maxWidth = input.maxWidth ?? PHASE_JPEG_MAX_WIDTH
  const quality = input.quality ?? PHASE_JPEG_QUALITY
  let out: HTMLCanvasElement = full
  if (srcW > maxWidth) {
    const scaled = document.createElement('canvas')
    scaled.width = maxWidth
    scaled.height = Math.max(1, Math.round((srcH * maxWidth) / srcW))
    const sctx = scaled.getContext('2d')
    if (!sctx) return null
    sctx.drawImage(full, 0, 0, scaled.width, scaled.height)
    out = scaled
  }
  try {
    const dataUrl = out.toDataURL('image/jpeg', quality)
    if (!dataUrl.startsWith('data:image/jpeg')) return null
    return { mime: 'image/jpeg', dataUrl }
  } catch {
    return null
  }
}

function paintPhaseCaption(ctx: CanvasRenderingContext2D, input: EncodePhaseStillInput): void {
  const { width, height } = ctx.canvas
  const pad = Math.max(10, Math.round(width * 0.018))
  const line = `${PHASE_LABEL_DE[input.phaseId]}  ${PHASE_TARGET_DEG[input.phaseId]}°  ·  Kurbel ${input.crankAngleDeg.toFixed(1)}°`
  const sub = `Einzelbild · ${input.side === 'left' ? 'links' : 'rechts'} · t ${input.timestampMs.toFixed(0)} ms${
    input.frameKneeDeg !== null ? ` · Knie ${input.frameKneeDeg.toFixed(1)}°` : ''
  }`
  ctx.save()
  ctx.fillStyle = 'rgba(18, 17, 15, 0.72)'
  ctx.fillRect(pad, height - pad - 52, Math.min(width - pad * 2, 520), 48)
  ctx.fillStyle = '#e8e0d4'
  ctx.font = '700 16px "Barlow Condensed", sans-serif'
  ctx.fillText(line, pad + 10, height - pad - 28)
  ctx.fillStyle = '#c4a35a'
  ctx.font = '12px "IBM Plex Mono", monospace'
  ctx.fillText(sub, pad + 10, height - pad - 10)
  ctx.restore()
}
