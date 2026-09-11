import { useCallback, useEffect, useRef, useState } from 'react'
import type { BikeMarkId } from '../types/calibration.ts'
import { drawProposal } from './drawProposal.ts'
import { MARK_ORDER } from './marks.ts'
import { toImageData, type PixelImage } from './pixels.ts'
import { selectedPoints, type DetectSession } from './propose.ts'

const HIT_R = 22

export type StillReviewProps = {
  image: PixelImage | null
  session: DetectSession
  activeMark: BikeMarkId
  onCorrect: (id: BikeMarkId, x: number, y: number) => void
  onSelectMark: (id: BikeMarkId) => void
}

function hitMark(session: DetectSession, x: number, y: number): BikeMarkId | null {
  const points = selectedPoints(session)
  if (!points) return null
  let best: BikeMarkId | null = null
  let bestD = HIT_R
  for (const id of MARK_ORDER) {
    const p = points[id]
    if (!p) continue
    const d = Math.hypot(p.pixel.x - x, p.pixel.y - y)
    if (d < bestD) {
      best = id
      bestD = d
    }
  }
  return best
}

export function StillReview({ image, session, activeMark, onCorrect, onSelectMark }: StillReviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ id: BikeMarkId; moved: boolean } | null>(null)

  const toImage = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas || !image) return null
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / rect.width
      const sy = canvas.height / rect.height
      const cx = (clientX - rect.left) * sx
      const cy = (clientY - rect.top) * sy
      const x = (cx - pan.x) / zoom
      const y = (cy - pan.y) / zoom
      if (x < 0 || y < 0 || x > image.width || y > image.height) return null
      return { x, y }
    },
    [image, pan.x, pan.y, zoom],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y)
    const frame = toImageData(image)
    ctx.putImageData(frame, 0, 0)
    // putImageData ignores transform — draw via bitmap path
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const tmp = document.createElement('canvas')
    tmp.width = image.width
    tmp.height = image.height
    tmp.getContext('2d')?.putImageData(frame, 0, 0)
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y)
    ctx.drawImage(tmp, 0, 0)
    drawProposal(ctx, session)
  }, [image, pan.x, pan.y, session, zoom])

  if (!image || (session.phase !== 'review' && session.phase !== 'applied')) return null

  return (
    <figure className="still-review" data-still-review>
      <canvas
        ref={canvasRef}
        className="still-review-canvas"
        aria-label="Standbild mit vorgeschlagenen Punkten, zoomen und ziehen"
        onPointerDown={(event) => {
          const pt = toImage(event.clientX, event.clientY)
          if (!pt) return
          const hit = hitMark(session, pt.x, pt.y)
          if (hit) {
            dragRef.current = { id: hit, moved: false }
            onSelectMark(hit)
            event.currentTarget.setPointerCapture(event.pointerId)
          }
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return
          const pt = toImage(event.clientX, event.clientY)
          if (!pt) return
          dragRef.current.moved = true
          onCorrect(dragRef.current.id, pt.x, pt.y)
        }}
        onPointerUp={() => {
          dragRef.current = null
        }}
        onClick={(event) => {
          if (dragRef.current?.moved) return
          const pt = toImage(event.clientX, event.clientY)
          if (!pt) return
          if (hitMark(session, pt.x, pt.y)) return
          onCorrect(activeMark, pt.x, pt.y)
        }}
      />
      <figcaption>
        Zoomen, Punkt ziehen oder klicken. Status bleibt sichtbar — nichts wird stillschweigend bestätigt.
        <span className="still-review-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}>
            −
          </button>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}>
            +
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1)
              setPan({ x: 0, y: 0 })
            }}
          >
            1:1
          </button>
        </span>
      </figcaption>
    </figure>
  )
}
