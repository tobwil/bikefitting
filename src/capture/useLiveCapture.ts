import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaptureAsset, CaptureError, CapturePhase, CaptureType } from '../types/capture.ts'
import { DEFAULT_COUNTDOWN_MS, DEFAULT_RECORD_MS } from './constants.ts'
import { CAPTURE_ERROR_COPY } from './copy.ts'
import { playCountdownCue } from '../flow/audioCues.ts'
import { finalizeCapture } from './finalize.ts'
import { createCameraRecorder, type CameraRecorder, type RecorderStopReason } from './recorder.ts'
import { tickCaptureClock, transitionCapture } from './state.ts'
import { getCaptureStore } from './storage.ts'

export type LiveCaptureApi = {
  phase: CapturePhase
  countdownRemainingMs: number
  recordRemainingMs: number
  countdownMs: number
  recordMs: number
  asset: CaptureAsset | null
  blob: Blob | null
  previewUrl: string | null
  error: CaptureError | null
  flash: 'start' | 'end' | null
  startCountdown: (opts?: { countdownMs?: number; recordMs?: number }) => void
  abort: () => void
  reset: () => void
  present: (asset: CaptureAsset, blob: Blob) => void
}

export function useLiveCapture(input: {
  stream: MediaStream | null
  captureType: CaptureType
  /** Pose failures must not stop the recorder. */
  poseError?: string | null
}): LiveCaptureApi {
  void input.poseError
  const [phase, setPhase] = useState<CapturePhase>('idle')
  const [countdownRemainingMs, setCountdownRemainingMs] = useState(DEFAULT_COUNTDOWN_MS)
  const [recordRemainingMs, setRecordRemainingMs] = useState(DEFAULT_RECORD_MS)
  const [countdownMs, setCountdownMs] = useState(DEFAULT_COUNTDOWN_MS)
  const [recordMs, setRecordMs] = useState(DEFAULT_RECORD_MS)
  const [asset, setAsset] = useState<CaptureAsset | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<CaptureError | null>(null)
  const [flash, setFlash] = useState<'start' | 'end' | null>(null)

  const recorderRef = useRef<CameraRecorder | null>(null)
  const countdownStartedAt = useRef<number | null>(null)
  const recordStartedAt = useRef<number | null>(null)
  const countdownMsRef = useRef(DEFAULT_COUNTDOWN_MS)
  const recordMsRef = useRef(DEFAULT_RECORD_MS)
  const phaseRef = useRef<CapturePhase>('idle')
  const previewUrlRef = useRef<string | null>(null)
  const finalizeLock = useRef(false)

  const setPhaseSafe = (next: CapturePhase) => {
    const allowed = transitionCapture(phaseRef.current, next)
    phaseRef.current = allowed
    setPhase(allowed)
    return allowed
  }

  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
  }

  const adoptSaved = (next: CaptureAsset, nextBlob: Blob) => {
    clearPreview()
    const url = URL.createObjectURL(nextBlob)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setAsset(next)
    setBlob(nextBlob)
    setError(null)
    phaseRef.current = 'saved'
    setPhase('saved')
  }

  const present = useCallback((next: CaptureAsset, nextBlob: Blob) => {
    adoptSaved(next, nextBlob)
  }, [])

  const finalize = useCallback(
    async (reason: RecorderStopReason) => {
      if (finalizeLock.current) return
      finalizeLock.current = true
      setPhaseSafe('finalizing')
      const recorder = recorderRef.current
      recorderRef.current = null
      try {
        if (!recorder) {
          setError({ code: 'camera_missing', message: CAPTURE_ERROR_COPY.camera_missing })
          setPhaseSafe('failed')
          return
        }
        const result = await recorder.stop(reason)
        playCountdownCue('end')
        setFlash('end')
        window.setTimeout(() => setFlash(null), 700)
        if (reason === 'abort' && result.byteLength <= 0) {
          setPhaseSafe('cancelled')
          return
        }
        const saved = await finalizeCapture({
          blob: result.blob,
          mime: result.mime,
          intendedDurationMs: recordMsRef.current,
          captureType: input.captureType,
          store: getCaptureStore(),
        })
        if ('code' in saved) {
          setError(saved)
          setPhaseSafe('failed')
          return
        }
        adoptSaved(saved.asset, saved.blob)
      } catch (cause) {
        setError({
          code: 'unknown',
          message: cause instanceof Error ? cause.message : CAPTURE_ERROR_COPY.unknown,
        })
        setPhaseSafe('failed')
      } finally {
        finalizeLock.current = false
      }
    },
    [input.captureType],
  )

  const startCountdown = useCallback(
    (opts?: { countdownMs?: number; recordMs?: number }) => {
      if (!input.stream || input.stream.getVideoTracks().length === 0) {
        setError({ code: 'camera_missing', message: CAPTURE_ERROR_COPY.camera_missing })
        setPhaseSafe('failed')
        return
      }
      const created = createCameraRecorder(input.stream)
      if ('code' in created) {
        setError(created)
        setPhaseSafe('failed')
        return
      }
      recorderRef.current = created
      const nextCountdown = opts?.countdownMs ?? DEFAULT_COUNTDOWN_MS
      const nextRecord = opts?.recordMs ?? DEFAULT_RECORD_MS
      countdownMsRef.current = nextCountdown
      recordMsRef.current = nextRecord
      setCountdownMs(nextCountdown)
      setRecordMs(nextRecord)
      setAsset(null)
      setBlob(null)
      setError(null)
      clearPreview()
      countdownStartedAt.current = performance.now()
      recordStartedAt.current = null
      setCountdownRemainingMs(nextCountdown)
      setRecordRemainingMs(nextRecord)
      setPhaseSafe('preparing')
      setPhaseSafe('countdown')
    },
    [input.stream],
  )

  const abort = useCallback(() => {
    if (phaseRef.current === 'countdown') {
      recorderRef.current = null
      countdownStartedAt.current = null
      setPhaseSafe('cancelled')
      return
    }
    if (phaseRef.current === 'recording') {
      void finalize('abort')
    }
  }, [finalize])

  const reset = useCallback(() => {
    recorderRef.current = null
    countdownStartedAt.current = null
    recordStartedAt.current = null
    finalizeLock.current = false
    setAsset(null)
    setBlob(null)
    setError(null)
    clearPreview()
    setFlash(null)
    phaseRef.current = 'idle'
    setPhase('idle')
  }, [])

  useEffect(() => {
    if (phase !== 'countdown' && phase !== 'recording') return
    let raf = 0
    const loop = (now: number) => {
      const tick = tickCaptureClock({
        phase: phaseRef.current,
        countdownStartedAtMs: countdownStartedAt.current,
        countdownMs: countdownMsRef.current,
        recordStartedAtMs: recordStartedAt.current,
        recordMs: recordMsRef.current,
        nowMs: now,
      })
      setCountdownRemainingMs(tick.countdownRemainingMs)
      setRecordRemainingMs(tick.recordRemainingMs)
      if (phaseRef.current === 'countdown' && tick.elapsed) {
        const recorder = recorderRef.current
        if (!recorder) {
          setError({ code: 'camera_missing', message: CAPTURE_ERROR_COPY.camera_missing })
          setPhaseSafe('failed')
          return
        }
        try {
          recorder.start()
        } catch {
          setError({ code: 'recorder_unsupported', message: CAPTURE_ERROR_COPY.recorder_unsupported })
          setPhaseSafe('failed')
          return
        }
        playCountdownCue('start')
        setFlash('start')
        window.setTimeout(() => setFlash(null), 700)
        recordStartedAt.current = performance.now()
        setPhaseSafe('recording')
      } else if (phaseRef.current === 'recording' && tick.elapsed) {
        void finalize('timer')
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [finalize, phase])

  useEffect(() => {
    const stream = input.stream
    if (!stream) return
    const onEnded = () => {
      if (phaseRef.current === 'recording') {
        void finalize('interrupt')
      } else if (phaseRef.current === 'countdown') {
        recorderRef.current = null
        setError({ code: 'camera_missing', message: CAPTURE_ERROR_COPY.camera_missing })
        setPhaseSafe('failed')
      }
    }
    const tracks = stream.getVideoTracks()
    for (const track of tracks) track.addEventListener('ended', onEnded)
    return () => {
      for (const track of tracks) track.removeEventListener('ended', onEnded)
    }
  }, [finalize, input.stream])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const rec = recorderRef.current
      if (rec?.active) void rec.stop('abort')
    }
  }, [])

  return {
    phase,
    countdownRemainingMs,
    recordRemainingMs,
    countdownMs,
    recordMs,
    asset,
    blob,
    previewUrl,
    error,
    flash,
    startCountdown,
    abort,
    reset,
    present,
  }
}
