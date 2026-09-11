/** Copy the current video frame onto a still canvas at source resolution. */
export function captureStillFrame(
  video: HTMLVideoElement,
  still: HTMLCanvasElement,
): boolean {
  const width = video.videoWidth
  const height = video.videoHeight
  if (width < 2 || height < 2) return false
  if (still.width !== width) still.width = width
  if (still.height !== height) still.height = height
  const ctx = still.getContext('2d')
  if (!ctx) return false
  ctx.drawImage(video, 0, 0, width, height)
  return true
}

export function clearStillFrame(still: HTMLCanvasElement | null) {
  if (!still) return
  const ctx = still.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, still.width, still.height)
}
