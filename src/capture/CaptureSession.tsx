import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useFit } from '../shell/FitSession.tsx'
import { useFlow } from '../flow/FlowProvider.tsx'
import type { CaptureAsset, CaptureError, CapturePhase, CaptureType } from '../types/capture.ts'
import { OPTIONAL_COUNTDOWN_MS } from './constants.ts'
import { framingFromPose, jointsFromPoseFrame, stabilizeHint, type FramingHint } from './framing.ts'
import { importLocalCapture } from './importLocal.ts'
import { attachDecodedFrameWatch, isPreviewConnected } from './liveness.ts'
import {
  classifyCameraKind,
  hasContinuityCamera,
  initialCameraPolicy,
  pickPreferredDevice,
  readLastSuccessfulCamera,
  shouldConfirmSwitch,
  writeLastSuccessfulCamera,
} from './preferredCamera.ts'
import { getCaptureStore } from './storage.ts'
import { useLiveCapture } from './useLiveCapture.ts'

export type CaptureSessionValue = {
  phase: CapturePhase
  connected: boolean
  countdownRemainingMs: number
  recordRemainingMs: number
  flash: 'start' | 'end' | null
  hint: FramingHint | null
  error: CaptureError | null
  cameraError: string | null
  asset: CaptureAsset | null
  previewUrl: string | null
  blob: Blob | null
  noIphone: boolean
  pendingMac: { deviceId: string; label: string } | null
  longPreroll: boolean
  setLongPreroll: (on: boolean) => void
  devices: { deviceId: string; label: string }[]
  currentId: string | null
  recording: boolean
  requestDevice: (deviceId: string) => void
  confirmMac: () => void
  cancelMac: () => void
  startRecord: () => void
  abort: () => void
  reset: () => void
  importFile: (file: File) => Promise<CaptureError | null>
  present: (asset: CaptureAsset, blob: Blob) => void
}

const CaptureSessionContext = createContext<CaptureSessionValue | null>(null)

export function useCaptureSession(): CaptureSessionValue {
  const ctx = useContext(CaptureSessionContext)
  if (!ctx) throw new Error('useCaptureSession must be used inside CaptureSessionProvider')
  return ctx
}

export function CaptureSessionProvider({ children }: { children: ReactNode }) {
  const fit = useFit()
  const flow = useFlow()
  const devices = fit.camera.status.devices
  const currentId = fit.camera.status.deviceId
  const currentKind = classifyCameraKind(devices.find((device) => device.deviceId === currentId)?.label ?? '')
  const captureType: CaptureType = currentKind === 'continuity' ? 'continuity' : 'webcam'
  const live = useLiveCapture({
    stream: fit.camera.stream,
    captureType,
    poseError: fit.pose.workerError,
  })
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => performance.now())
  const [longPreroll, setLongPreroll] = useState(false)
  const [pendingMac, setPendingMac] = useState<{ deviceId: string; label: string } | null>(null)
  const [hint, setHint] = useState<FramingHint | null>(null)
  const hintAtRef = useRef(0)
  const bootRef = useRef(false)
  const recording =
    live.phase === 'countdown' || live.phase === 'recording' || live.phase === 'finalizing'

  useEffect(() => {
    const id = window.setInterval(() => setNow(performance.now()), 200)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const video = fit.videoRef.current
    if (!video) return
    return attachDecodedFrameWatch(video, (at) => setLastFrameAt(at))
  }, [fit.camera.playback.playable, fit.camera.stream, fit.videoRef])

  const connected = isPreviewConnected({
    hasStreamObject: Boolean(fit.camera.stream),
    playable: fit.camera.playback.playable && !fit.camera.playback.playError,
    lastDecodedFrameAtMs: lastFrameAt,
    nowMs: now,
  })

  useEffect(() => {
    if (!connected || !currentId) return
    const device = devices.find((row) => row.deviceId === currentId)
    writeLastSuccessfulCamera({
      deviceId: currentId,
      label: device?.label ?? '',
      kind: classifyCameraKind(device?.label ?? ''),
      savedAt: new Date().toISOString(),
    })
  }, [connected, currentId, devices])

  useEffect(() => {
    if (bootRef.current || recording) return
    if (fit.camera.status.permission === 'prompting' || fit.camera.status.permission === 'granted') {
      bootRef.current = true
      return
    }
    const policy = initialCameraPolicy({
      devices,
      lastSuccessful: readLastSuccessfulCamera(),
      permissionGranted: false,
    })
    if (policy.action === 'start') {
      bootRef.current = true
      void fit.camera.start(policy.deviceId)
    }
  }, [devices, fit.camera, fit.camera.status.permission, recording])

  useEffect(() => {
    if (recording || fit.camera.status.permission !== 'granted') return
    const preferred = pickPreferredDevice({
      devices,
      lastSuccessfulId: readLastSuccessfulCamera()?.deviceId ?? null,
    })
    if (preferred.deviceId && preferred.deviceId !== currentId && preferred.reason === 'continuity') {
      void fit.camera.start(preferred.deviceId)
    }
  }, [currentId, devices, fit.camera, fit.camera.status.permission, recording])

  const joints = jointsFromPoseFrame(fit.pose.frame)
  const freshness =
    fit.pose.freshness.status === 'live' ||
    fit.pose.freshness.status === 'stale' ||
    fit.pose.freshness.status === 'lost'
      ? fit.pose.freshness.status
      : 'unknown'
  const hintKey = `${connected}:${fit.pose.ready}:${freshness}:${joints.hip}:${joints.knee}:${joints.ankle}:${joints.foot}`
  useEffect(() => {
    const nextRaw = framingFromPose({
      connected,
      poseReady: fit.pose.ready,
      freshness,
      ...joints,
    })
    setHint((prev) => {
      const next = stabilizeHint(prev, nextRaw, performance.now() - hintAtRef.current)
      if (next.code !== prev?.code) hintAtRef.current = performance.now()
      if (next.code === prev?.code && next.message === prev.message) return prev
      return next
    })
  }, [connected, fit.pose.ready, freshness, hintKey, joints])

  const requestDevice = useCallback(
    (deviceId: string) => {
      if (recording) return
      const next = devices.find((device) => device.deviceId === deviceId)
      if (!next) return
      if (
        shouldConfirmSwitch({
          liveDeviceId: currentId,
          liveKind: currentKind,
          liveActive: connected,
          nextDeviceId: next.deviceId,
          nextKind: classifyCameraKind(next.label),
        })
      ) {
        setPendingMac(next)
        return
      }
      void fit.camera.start(next.deviceId)
    },
    [connected, currentId, currentKind, devices, fit.camera, recording],
  )

  const startRecord = useCallback(() => {
    live.startCountdown({
      countdownMs: longPreroll ? OPTIONAL_COUNTDOWN_MS : undefined,
    })
  }, [live, longPreroll])

  const importFile = useCallback(async (file: File) => {
    const result = await importLocalCapture(file, getCaptureStore())
    if ('code' in result) return result
    live.present(result.asset, result.blob)
    void flow.refreshCaptures()
    return null
  }, [flow, live])

  useEffect(() => {
    const id = flow.pendingCaptureId
    if (!id) return
    let cancelled = false
    void getCaptureStore()
      .get(id)
      .then((row) => {
        if (cancelled) return
        if (row) live.present(row.asset, row.blob)
        flow.clearPendingCapture()
      })
    return () => {
      cancelled = true
    }
  }, [flow.pendingCaptureId, flow.clearPendingCapture, live.present])

  useEffect(() => {
    if (live.phase === 'saved' && live.asset) void flow.refreshCaptures()
  }, [flow, live.asset, live.phase])

  const value = useMemo<CaptureSessionValue>(
    () => ({
      phase: live.phase,
      connected,
      countdownRemainingMs: live.countdownRemainingMs,
      recordRemainingMs: live.recordRemainingMs,
      flash: live.flash,
      hint,
      error: live.error,
      cameraError: fit.camera.status.error,
      asset: live.asset,
      previewUrl: live.previewUrl,
      blob: live.blob,
      noIphone:
        !hasContinuityCamera(devices) &&
        (fit.camera.status.permission === 'granted' ||
          fit.camera.status.permission === 'unavailable' ||
          fit.camera.status.permission === 'denied' ||
          fit.camera.status.permission === 'error' ||
          fit.camera.status.permission === 'stopped'),
      pendingMac,
      longPreroll,
      setLongPreroll,
      devices,
      currentId,
      recording,
      requestDevice,
      confirmMac: () => {
        if (!pendingMac) return
        const id = pendingMac.deviceId
        setPendingMac(null)
        void fit.camera.start(id)
      },
      cancelMac: () => setPendingMac(null),
      startRecord,
      abort: live.abort,
      reset: live.reset,
      importFile,
      present: live.present,
    }),
    [
      connected,
      currentId,
      devices,
      fit.camera,
      hint,
      importFile,
      live,
      longPreroll,
      pendingMac,
      recording,
      requestDevice,
      startRecord,
    ],
  )

  return <CaptureSessionContext.Provider value={value}>{children}</CaptureSessionContext.Provider>
}
