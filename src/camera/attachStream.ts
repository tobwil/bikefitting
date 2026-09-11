export const MIN_PLAYABLE_EDGE = 2

export function isVideoPlayable(video: {
  readyState: number
  videoWidth: number
  videoHeight: number
}): boolean {
  return (
    video.readyState >= 2 &&
    video.videoWidth >= MIN_PLAYABLE_EDGE &&
    video.videoHeight >= MIN_PLAYABLE_EDGE
  )
}

export type AttachStreamResult = {
  playable: boolean
  width: number
  height: number
  playError: string | null
}

function snapshot(video: HTMLVideoElement, playError: string | null): AttachStreamResult {
  return {
    playable: isVideoPlayable(video) && !playError,
    width: video.videoWidth,
    height: video.videoHeight,
    playError,
  }
}

/**
 * Bind a stream to a concrete <video> element. Safe to call on remount and on
 * stream identity change. Does not stop tracks — leaving Start / Stop does that.
 */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream | null,
): Promise<AttachStreamResult> {
  if (video.getAttribute('src')) {
    video.removeAttribute('src')
  }
  if (video.srcObject !== stream) {
    video.srcObject = stream
  }
  if (!stream) {
    return { playable: false, width: 0, height: 0, playError: null }
  }

  try {
    await video.play()
  } catch (error) {
    const playError =
      error instanceof Error && error.message
        ? error.message
        : 'Wiedergabe fehlgeschlagen (play()).'
    return snapshot(video, playError)
  }

  if (!isVideoPlayable(video)) {
    await waitForMetadata(video, 2500)
  }
  return snapshot(video, null)
}

export function detachStreamFromVideo(video: HTMLVideoElement | null) {
  if (!video) return
  video.srcObject = null
  if (video.src && video.src.startsWith('blob:')) {
    video.removeAttribute('src')
    video.load()
  }
}

/**
 * Bind a local file URL. Clears any live srcObject. Does not upload.
 */
export async function attachFileToVideo(
  video: HTMLVideoElement,
  objectUrl: string | null,
): Promise<AttachStreamResult> {
  if (video.srcObject) {
    video.srcObject = null
  }
  if (!objectUrl) {
    if (video.getAttribute('src')) {
      video.removeAttribute('src')
      video.load()
    }
    return { playable: false, width: 0, height: 0, playError: null }
  }
  if (video.currentSrc !== objectUrl && video.src !== objectUrl) {
    video.src = objectUrl
  }
  video.loop = false
  video.muted = true
  video.playsInline = true
  try {
    await video.play()
  } catch {
    await waitForMetadata(video, 2500)
    if (isVideoPlayable(video)) return snapshot(video, null)
    return snapshot(video, 'Datei konnte nicht abgespielt werden.')
  }
  if (!isVideoPlayable(video)) {
    await waitForMetadata(video, 2500)
  }
  return snapshot(video, null)
}

function waitForMetadata(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (isVideoPlayable(video)) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('loadedmetadata', done)
      video.removeEventListener('playing', done)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(done, timeoutMs)
    video.addEventListener('loadedmetadata', done)
    video.addEventListener('playing', done)
  })
}
