export type FrameDiscontinuity = {
  prevMediaMs: number
  nextMediaMs: number
  transportSeek: boolean
}

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
  mediaTimeMs: number
  videoWidth: number
  videoHeight: number
}) => Promise<void>

export type FrameLoopOptions = {
  /** File replay uses the media clock so pause/seek cannot invent wall-clock frames. */
  timestampClock?: 'wall' | 'media'
  onDiscontinuity?: (info: FrameDiscontinuity) => void
  maxGapMs?: number
}

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
  options: FrameLoopOptions = {},
): FrameSyncHandle {
  let stopped = false
  let busy = false
  let lastMediaTime = -1
  let lastMediaMs: number | null = null
  let handle = 0
  let pendingTransportSeek = false
  const clock = options.timestampClock ?? 'wall'
  const maxGapMs = options.maxGapMs ?? 80

  const onSeeking = () => {
    pendingTransportSeek = true
  }
  video.addEventListener('seeking', onSeeking)

  const tick = (now: number, metadata?: VideoFrameCallbackMetadata) => {
    if (stopped) return
    const mediaTime = metadata?.mediaTime ?? video.currentTime
    const mediaTimeMs = mediaTime * 1000
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
    if (lastMediaMs !== null) {
      const dt = mediaTimeMs - lastMediaMs
      if (dt < -1 || dt > maxGapMs) {
        options.onDiscontinuity?.({
          prevMediaMs: lastMediaMs,
          nextMediaMs: mediaTimeMs,
          transportSeek: pendingTransportSeek,
        })
      }
    }
    pendingTransportSeek = false
    lastMediaTime = mediaTime
    lastMediaMs = mediaTimeMs
    busy = true
    const timestampMs =
      clock === 'media'
        ? mediaTimeMs
        : typeof metadata?.expectedDisplayTime === 'number'
          ? metadata.expectedDisplayTime
          : now
    void (async () => {
      let preview: ImageBitmap | null = null
      let bitmap: ImageBitmap | null = null
      try {
        preview = await createImageBitmap(video)
        bitmap = await createImageBitmap(preview)
        await onFrame({
          bitmap,
          preview,
          timestampMs,
          mediaTimeMs,
          videoWidth: width,
          videoHeight: height,
        })
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
      video.removeEventListener('seeking', onSeeking)
      cancelFrame(video, handle)
    },
  }
}
