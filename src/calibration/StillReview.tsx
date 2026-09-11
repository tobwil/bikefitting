import { useCallback, useEffect, useRef, useState } from 'react'
import type { BikeMarkId } from '../types/calibration.ts'
import { drawProposal } from './drawProposal.ts'
import { MARK_ORDER } from './marks.ts'
import { toImageData, type PixelImage } from './pixels.ts'
import { selectedPoints, type DetectSession } from './propose.ts'
import {
  IDENTITY_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  applyViewTransform,
  clientToImage,
  clampPan,
  panBy,
  viewToImage,
  zoomAround,
  type ViewTransform,
} from './viewTransform.ts'

const HIT_R = 22
const PAN_SLOP = 4

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

type DragState =
  | { type: 'mark'; id: BikeMarkId; moved: boolean }
  | { type: 'pan'; startX: number; startY: number; orig: ViewTransform; moved: boolean }

export function StillReview({ image, session, activeMark, onCorrect, onSelectMark }: StillReviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [view, setView] = useState<ViewTransform>(IDENTITY_VIEW)
  const viewRef = useRef(view)
  const dragRef = useRef<DragState | null>(null)
  const skipClickRef = useRef(false)

  useEffect(() => {
    viewRef.current = view
  }, [view])

  const focalImage = useCallback(() => {
    if (!image) return { x: 0, y: 0 }
    const mark = selectedPoints(session)?.[activeMark]?.pixel
    if (mark) return mark
    const canvas = canvasRef.current
    if (canvas) {
      const mid = viewToImage(viewRef.current, canvas.width / 2, canvas.height / 2)
      if (mid.x >= 0 && mid.y >= 0 && mid.x <= image.width && mid.y <= image.height) return mid
    }
    return { x: image.width / 2, y: image.height / 2 }
  }, [activeMark, image, session])

  const toImage = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current
      if (!canvas || !image) return null
      const rect = canvas.getBoundingClientRect()
      return clientToImage(
        clientX,
        clientY,
        { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        { width: canvas.width, height: canvas.height },
        view,
        image,
      )
    },
    [image, view],
  )

  const stepZoom = useCallback(
    (delta: number) => {
      if (!image) return
      const focal = focalImage()
      setView((prev) => {
        const next = zoomAround(prev, Number((prev.zoom + delta).toFixed(2)), focal.x, focal.y)
        return clampPan(next, image.width, image.height)
      })
    },
    [focalImage, image],
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
    const frame = toImageData(image)
    const tmp = document.createElement('canvas')
    tmp.width = image.width
    tmp.height = image.height
    tmp.getContext('2d')?.putImageData(frame, 0, 0)
    applyViewTransform(ctx, view)
    ctx.drawImage(tmp, 0, 0)
    drawProposal(ctx, session)
  }, [image, session, view])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / rect.width
      const sy = canvas.height / rect.height
      if (event.ctrlKey || event.metaKey) {
        const pt = clientToImage(
          event.clientX,
          event.clientY,
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          { width: canvas.width, height: canvas.height },
          viewRef.current,
          image,
        )
        const focal = pt ?? focalImage()
        const dir = event.deltaY > 0 ? -0.25 : 0.25
        setView((prev) =>
          clampPan(
            zoomAround(prev, Number((prev.zoom + dir).toFixed(2)), focal.x, focal.y),
            image.width,
            image.height,
          ),
        )
        return
      }
      setView((prev) => panBy(prev, -event.deltaX * sx, -event.deltaY * sy, image.width, image.height))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [focalImage, image])

  if (!image || (session.phase !== 'review' && session.phase !== 'applied')) return null

  return (
    <figure
      className="still-review"
      data-still-review
      data-zoom={String(view.zoom)}
      data-pan-x={String(Math.round(view.panX))}
      data-pan-y={String(Math.round(view.panY))}
    >
      <canvas
        ref={canvasRef}
        className="still-review-canvas"
        aria-label="Standbild mit vorgeschlagenen Punkten, zoomen, schieben und ziehen"
        onPointerDown={(event) => {
          const canvas = event.currentTarget
          const rect = canvas.getBoundingClientRect()
          const sx = canvas.width / rect.width
          const sy = canvas.height / rect.height
          const viewPt = {
            x: (event.clientX - rect.left) * sx,
            y: (event.clientY - rect.top) * sy,
          }
          const pt = viewToImage(view, viewPt.x, viewPt.y)
          const hit =
            pt.x >= 0 && pt.y >= 0 && pt.x <= image.width && pt.y <= image.height
              ? hitMark(session, pt.x, pt.y)
              : null
          skipClickRef.current = false
          if (hit) {
            dragRef.current = { type: 'mark', id: hit, moved: false }
            onSelectMark(hit)
          } else {
            dragRef.current = {
              type: 'pan',
              startX: event.clientX,
              startY: event.clientY,
              orig: view,
              moved: false,
            }
          }
          canvas.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          if (drag.type === 'mark') {
            const pt = toImage(event.clientX, event.clientY)
            if (!pt) return
            drag.moved = true
            onCorrect(drag.id, pt.x, pt.y)
            return
          }
          const canvas = event.currentTarget
          const rect = canvas.getBoundingClientRect()
          const sx = canvas.width / rect.width
          const sy = canvas.height / rect.height
          const dx = (event.clientX - drag.startX) * sx
          const dy = (event.clientY - drag.startY) * sy
          if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < PAN_SLOP) return
          drag.moved = true
          skipClickRef.current = true
          setView(clampPan({ zoom: drag.orig.zoom, panX: drag.orig.panX + dx, panY: drag.orig.panY + dy }, image.width, image.height))
        }}
        onPointerUp={() => {
          if (dragRef.current?.moved) skipClickRef.current = true
          dragRef.current = null
        }}
        onClick={(event) => {
          if (skipClickRef.current) {
            skipClickRef.current = false
            return
          }
          const pt = toImage(event.clientX, event.clientY)
          if (!pt) return
          if (hitMark(session, pt.x, pt.y)) return
          onCorrect(activeMark, pt.x, pt.y)
        }}
      />
      <figcaption>
        Zoomen um den gewählten Punkt, Bild schieben, Punkt ziehen oder klicken. Status bleibt sichtbar — nichts wird
        stillschweigend bestätigt.
        <span className="still-review-zoom">
          <button
            type="button"
            data-action="still-zoom-out"
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => stepZoom(-0.25)}
          >
            −
          </button>
          <button
            type="button"
            data-action="still-zoom-in"
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() => stepZoom(0.25)}
          >
            +
          </button>
          <button
            type="button"
            data-action="still-zoom-reset"
            onClick={() => setView(IDENTITY_VIEW)}
          >
            1:1
          </button>
        </span>
      </figcaption>
    </figure>
  )
}
