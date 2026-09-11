import { MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { sampleFootFrame } from './diagnostic.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'

const HEEL = '#e8a87c'
const TOE = '#6ec8c4'
const LOCKED = '#c45c3a'

/** Extra heel / toe overlay. Uses existing landmarks — no new engine. */
export function drawFootOverlay(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame | null,
  pedal: PedalSample | null,
  minVisibility = MIN_LANDMARK_VISIBILITY,
): void {
  const sample = sampleFootFrame(frame, pedal, minVisibility)
  if (!sample) return

  const mark = (
    pixel: { x: number; y: number } | null,
    color: string,
    label: string,
    occluded: boolean,
  ) => {
    if (!pixel) return
    ctx.beginPath()
    ctx.strokeStyle = occluded ? LOCKED : color
    ctx.fillStyle = occluded ? 'rgba(196, 92, 58, 0.2)' : color
    ctx.lineWidth = 2
    ctx.arc(pixel.x, pixel.y, occluded ? 7 : 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.font = '700 12px "Barlow Condensed", sans-serif'
    ctx.fillStyle = occluded ? LOCKED : color
    ctx.fillText(occluded ? `${label} verdeckt` : label, pixel.x + 8, pixel.y + 4)
  }

  if (sample.heel.pixel) mark(sample.heel.pixel, HEEL, 'Ferse', sample.heel.occluded)
  if (sample.toe.pixel) mark(sample.toe.pixel, TOE, 'Zehe', sample.toe.occluded)

  if (sample.heel.pixel && sample.toe.pixel && !sample.metricLocked) {
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(232, 168, 124, 0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.moveTo(sample.heel.pixel.x, sample.heel.pixel.y)
    ctx.lineTo(sample.toe.pixel.x, sample.toe.pixel.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (sample.metricLocked) {
    ctx.fillStyle = 'rgba(196, 92, 58, 0.92)'
    ctx.fillRect(16, 58, 168, 28)
    ctx.fillStyle = '#fff4ee'
    ctx.font = '700 16px "Barlow Condensed", sans-serif'
    ctx.fillText('Fußmetrik gesperrt', 26, 77)
  }
}
