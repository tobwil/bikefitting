import { RECORDER_TIMESLICE_MS } from './constants.ts'
import { pickRecorderMime, recorderHasAudioTracks, type RecorderMime } from './mime.ts'
import { CAPTURE_ERROR_COPY } from './copy.ts'
import type { CaptureError } from '../types/capture.ts'

export type RecorderStopReason = 'timer' | 'interrupt' | 'abort'

export type RecorderResult = {
  blob: Blob
  mime: RecorderMime
  byteLength: number
  reason: RecorderStopReason
  hasAudioTracks: false
  elapsedMs: number
}

export type CameraRecorder = {
  start: () => void
  stop: (reason: RecorderStopReason) => Promise<RecorderResult>
  readonly active: boolean
  readonly mime: RecorderMime
}

function waitRecorderStop(recorder: MediaRecorder): Promise<void> {
  if (recorder.state === 'inactive') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      recorder.removeEventListener('stop', done)
      resolve()
    }
    recorder.addEventListener('stop', done)
    window.setTimeout(done, 4000)
  })
}

export function createCameraRecorder(
  stream: MediaStream,
  options: { timesliceMs?: number; mime?: RecorderMime | null } = {},
): CameraRecorder | CaptureError {
  if (typeof MediaRecorder === 'undefined') {
    return { code: 'recorder_unsupported', message: CAPTURE_ERROR_COPY.recorder_unsupported }
  }
  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) {
    return { code: 'camera_missing', message: CAPTURE_ERROR_COPY.camera_missing }
  }
  if (recorderHasAudioTracks(stream)) {
    for (const track of stream.getAudioTracks()) {
      track.stop()
      stream.removeTrack(track)
    }
  }
  const mime = options.mime ?? pickRecorderMime()
  if (!mime) {
    return { code: 'recorder_unsupported', message: CAPTURE_ERROR_COPY.recorder_unsupported }
  }

  let recorder: MediaRecorder
  try {
    recorder = mime.mimeType
      ? new MediaRecorder(stream, { mimeType: mime.mimeType, audioBitsPerSecond: 0 })
      : new MediaRecorder(stream)
  } catch {
    return { code: 'recorder_unsupported', message: CAPTURE_ERROR_COPY.recorder_unsupported }
  }

  const chunks: Blob[] = []
  let stopPromise: Promise<RecorderResult> | null = null
  let stopReason: RecorderStopReason = 'timer'
  let startedAtMs = 0

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data)
  })

  const finish = async (reason: RecorderStopReason): Promise<RecorderResult> => {
    stopReason = reason
    if (recorder.state !== 'inactive') {
      try {
        recorder.requestData?.()
      } catch {
        /* older engines */
      }
      try {
        recorder.stop()
      } catch {
        /* already stopping */
      }
      await waitRecorderStop(recorder)
    }
    const blob = new Blob(chunks, { type: mime.mimeType.split(';')[0] || 'video/webm' })
    const elapsedMs = startedAtMs > 0 ? Math.max(0, performance.now() - startedAtMs) : 0
    return {
      blob,
      mime,
      byteLength: blob.size,
      reason: stopReason,
      hasAudioTracks: false,
      elapsedMs,
    }
  }

  const onTrackEnded = () => {
    if (recorder.state === 'inactive') return
    void finish('interrupt')
  }
  for (const track of videoTracks) {
    track.addEventListener('ended', onTrackEnded, { once: true })
  }

  return {
    get active() {
      return recorder.state !== 'inactive'
    },
    mime,
    start() {
      if (recorder.state !== 'inactive') return
      chunks.length = 0
      startedAtMs = performance.now()
      recorder.start(options.timesliceMs ?? RECORDER_TIMESLICE_MS)
    },
    stop(reason: RecorderStopReason) {
      if (!stopPromise) stopPromise = finish(reason)
      return stopPromise
    },
  }
}
