/** Shared still-review view: zoom/pan in canvas bitmap space. Image, overlay, hit-test, clicks. */

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export type ViewTransform = {
  zoom: number
  panX: number
  panY: number
}

export const IDENTITY_VIEW: ViewTransform = { zoom: 1, panX: 0, panY: 0 }

export type CanvasRect = {
  left: number
  top: number
  width: number
  height: number
}

export type Size = {
  width: number
  height: number
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function imageToView(view: ViewTransform, x: number, y: number): { x: number; y: number } {
  return { x: x * view.zoom + view.panX, y: y * view.zoom + view.panY }
}

export function viewToImage(view: ViewTransform, x: number, y: number): { x: number; y: number } {
  return { x: (x - view.panX) / view.zoom, y: (y - view.panY) / view.zoom }
}

export function clientToView(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  canvas: Size,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  }
}

export function clientToImage(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  canvas: Size,
  view: ViewTransform,
  image: Size,
): { x: number; y: number } | null {
  const v = clientToView(clientX, clientY, rect, canvas)
  if (!v) return null
  const p = viewToImage(view, v.x, v.y)
  if (p.x < 0 || p.y < 0 || p.x > image.width || p.y > image.height) return null
  return p
}

/** CSS client position that maps back to an image point under the same transform. */
export function imageToClient(
  point: { x: number; y: number },
  rect: CanvasRect,
  canvas: Size,
  view: ViewTransform,
): { clientX: number; clientY: number } {
  const v = imageToView(view, point.x, point.y)
  return {
    clientX: rect.left + (v.x / canvas.width) * rect.width,
    clientY: rect.top + (v.y / canvas.height) * rect.height,
  }
}

export function zoomAround(
  view: ViewTransform,
  nextZoom: number,
  focalImageX: number,
  focalImageY: number,
): ViewTransform {
  const zoom = clampZoom(nextZoom)
  const focal = imageToView(view, focalImageX, focalImageY)
  return {
    zoom,
    panX: focal.x - focalImageX * zoom,
    panY: focal.y - focalImageY * zoom,
  }
}

export function clampPan(view: ViewTransform, width: number, height: number): ViewTransform {
  const zoom = clampZoom(view.zoom)
  if (zoom <= MIN_ZOOM) return { ...IDENTITY_VIEW }
  const minX = width * (1 - zoom)
  const minY = height * (1 - zoom)
  return {
    zoom,
    panX: Math.min(0, Math.max(minX, view.panX)),
    panY: Math.min(0, Math.max(minY, view.panY)),
  }
}

export function panBy(view: ViewTransform, dx: number, dy: number, width: number, height: number): ViewTransform {
  return clampPan({ zoom: view.zoom, panX: view.panX + dx, panY: view.panY + dy }, width, height)
}

/** Pan (and optionally zoom) so the image point sits at the canvas center, then clamp. */
export function focusOn(
  view: ViewTransform,
  point: { x: number; y: number },
  width: number,
  height: number,
  zoom: number = view.zoom,
): ViewTransform {
  const z = clampZoom(zoom)
  return clampPan(
    {
      zoom: z,
      panX: width / 2 - point.x * z,
      panY: height / 2 - point.y * z,
    },
    width,
    height,
  )
}

export function inView(
  view: ViewTransform,
  point: { x: number; y: number },
  width: number,
  height: number,
  pad = 0,
): boolean {
  const v = imageToView(view, point.x, point.y)
  return v.x >= pad && v.y >= pad && v.x <= width - pad && v.y <= height - pad
}

export function applyViewTransform(ctx: CanvasRenderingContext2D, view: ViewTransform): void {
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.panX, view.panY)
}
