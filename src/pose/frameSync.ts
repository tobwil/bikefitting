export function findPoseVideo(root: ParentNode = document): HTMLVideoElement | null {
  const stage = root.querySelector('[data-slot="stage"] video')
  if (stage instanceof HTMLVideoElement) return stage
  const marked = root.querySelector('video[data-bikefit-source]')
  if (marked instanceof HTMLVideoElement) return marked
  const any = root.querySelector('video')
  return any instanceof HTMLVideoElement ? any : null
}

export type VideoFrameHandler = (input: {
  bitmap: ImageBitmap
  preview: ImageBitmap
  timestampMs: number
  videoWidth: number
  videoHeight: number
}) => Promise<void>

export type FrameSyncHandle = {
  stop: () => void
}

function scheduleFrame(
  video: HTMLVideoElement,
  callback: (now: number, metadata?: VideoFrameCallbackMetadata) => void,
): number {
  if (typeof video.requestVideoFrameCallback === 'function') {
    return video.requestVideoFrameCallback(callback)
  }
  return requestAnimationFrame((now) => {
    callback(now)
  })
}

function cancelFrame(video: HTMLVideoElement, id: number) {
  if (typeof video.cancelVideoFrameCallback === 'function') {
    video.cancelVideoFrameCallback(id)
    return
  }
  cancelAnimationFrame(id)
}

export function startVideoFrameLoop(
  video: HTMLVideoElement,
  onFrame: VideoFrameHandler,
): FrameSyncHandle {
  let stopped = false
  let busy = false
  let lastMediaTime = -1
  let handle = 0

  const tick = (now: number, metadata?: VideoFrameCallbackMetadata) => {
    if (stopped) return
    const mediaTime = metadata?.mediaTime ?? video.currentTime
    const ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    const width = video.videoWidth
    const height = video.videoHeight
    if (!ready || width < 2 || height < 2 || mediaTime === lastMediaTime) {
      handle = scheduleFrame(video, tick)
      return
    }
    if (busy) {
      handle = scheduleFrame(video, tick)
      return
    }
    lastMediaTime = mediaTime
    busy = true
    const timestampMs =
      typeof metadata?.expectedDisplayTime === 'number'
        ? metadata.expectedDisplayTime
        : now
    void (async () => {
      let preview: ImageBitmap | null = null
      let bitmap: ImageBitmap | null = null
      try {
        preview = await createImageBitmap(video)
        bitmap = await createImageBitmap(preview)
        await onFrame({ bitmap, preview, timestampMs, videoWidth: width, videoHeight: height })
        bitmap = null
      } catch {
        bitmap?.close()
        preview?.close()
      } finally {
        busy = false
        if (!stopped) handle = scheduleFrame(video, tick)
      }
    })()
  }

  handle = scheduleFrame(video, tick)
  return {
    stop() {
      stopped = true
      cancelFrame(video, handle)
    },
  }
}
