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
import { ALLOW_SYNTHETIC_FIXTURE, MIN_LANDMARK_VISIBILITY } from '../config/defaults.ts'
import { attachStreamToVideo, detachStreamFromVideo, isVideoPlayable } from '../camera/attachStream.ts'
import { geometryFromStatus, makeSetupId } from '../camera/setupId.ts'
import { useCamera } from '../camera/useCamera.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { measureKneeAngle } from '../calibration/kneeAngle.ts'
import { emptyCalibration, loadCalibration, saveCalibration } from '../calibration/storage.ts'
import { captureStillFrame, clearStillFrame } from '../calibration/stillFrame.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { assessCalibration } from '../calibration/validity.ts'
import { drawPedalSelection } from '../pedal/drawSeed.ts'
import { createPedalTracker, findMagentaMarker } from '../pedal/tracker.ts'
import { runTenRevolutionHarness } from '../pedal/harness.ts'
import type { PedalHarnessResult } from '../pedal/harness.ts'
import {
  createMeasurementCapture,
  createMetricsPipeline,
  emptyMeasurementSnapshot,
  emptyMetricsReport,
  runMetricsHarness,
} from '../metrics/index.ts'
import type { MeasurementSnapshot, MetricsHarnessResult } from '../metrics/index.ts'
import type { MetricsReport } from '../types/metrics.ts'
import { createPoseEngine } from '../pose/createPoseEngine.ts'
import { drawIstOverlay, landmarkToPixel } from '../pose/drawIst.ts'
import {
  poseFreshness,
  poseIsReady,
  POSE_LOST_MS,
  POSE_RUNTIME_FAIL_LIMIT,
  type PoseFreshness,
} from '../pose/freshness.ts'
import { startVideoFrameLoop } from '../pose/frameSync.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import {
  DEFAULT_SOLL_UI,
  drawSollOverlay,
  emptyBodyModel,
  emptySollResult,
  estimateBodyModel,
  measureBodyFromIst,
  runSollHarness,
  scaledBodyModel,
  solveSoll,
  syntheticPhase01,
} from '../soll/index.ts'
import type { SollHarnessResult } from '../soll/index.ts'
import type {
  BikeCalibration,
  BikeMarkId,
  CalibrationBinding,
  KneeAngleReading,
  PixelPoint,
} from '../types/calibration.ts'
import type { CameraStatus, VideoPlayback } from '../types/camera.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { BodyModel, SollSolveResult, SollUiState } from '../types/soll.ts'
import { drawGhostOverlay, type OverlayGhost } from './drawGhost.ts'
import { clientToVideoPixel, sizeOverlayToVideo } from './videoCoords.ts'

export type WorkerStatus = 'idle' | 'loading' | 'WORKER_READY' | 'error'
export type StageClickMode = 'off' | 'calibrate' | 'pedal'

const IDLE_PLAYBACK: VideoPlayback = {
  playable: false,
  width: 0,
  height: 0,
  playError: null,
}

const IDLE_PEDAL: PedalSample = {
  timestampMs: 0,
  pixel: null,
  crankAngleDeg: null,
  phase01: null,
  revolutions: 0,
  status: 'idle',
  lostFrames: 0,
}

export type FitSession = {
  camera: {
    status: CameraStatus
    stream: MediaStream | null
    start: (deviceId?: string) => Promise<void>
    stop: () => void
    restart: () => Promise<void>
    startSynthetic: () => void
    allowSynthetic: boolean
    playback: VideoPlayback
  }
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  attachVideo: (el: HTMLVideoElement | null) => void
  attachOverlay: (el: HTMLCanvasElement | null) => void
  attachStill: (el: HTMLCanvasElement | null) => void
  pose: {
    workerStatus: WorkerStatus
    workerError: string | null
    frame: PoseFrame | null
    inferenceMs: number | null
    nearSide: string
    frameSync: 'rvfc' | 'raf' | 'idle'
    freshness: PoseFreshness
    ready: boolean
    retry: () => Promise<void>
    simulateLoss: () => void
  }
  calibration: {
    data: BikeCalibration
    activeMark: BikeMarkId
    setActiveMark: (id: BikeMarkId) => void
    placeMark: (id: BikeMarkId, point: PixelPoint) => void
    clearMarks: () => void
    applyFixtureMarks: () => void
    save: () => void
    load: () => void
    knee: KneeAngleReading
    frozen: boolean
    toggleFreeze: () => void
    clearFreeze: () => void
    allowFixture: boolean
    assessment: ReturnType<typeof assessCalibration>
  }
  pedal: {
    sample: PedalSample
    harness: PedalHarnessResult | null
    runHarness: () => void
    seedAt: (point: PixelPoint) => void
    reset: () => void
    selecting: boolean
    setSelecting: (on: boolean) => void
    seedPoint: PixelPoint | null
  }
  metrics: {
    report: MetricsReport
    capture: MeasurementSnapshot
    startCountdown: (seconds?: number, nowMs?: number) => void
    tickCapture: (nowMs?: number) => void
    beginRecording: () => void
    finishRecording: () => MeasurementSnapshot
    abortRecording: (reason?: string) => void
    resetCapture: () => void
    harness: MetricsHarnessResult | null
    runHarness: () => void
    reset: () => void
  }
  soll: {
    result: SollSolveResult
    ui: SollUiState
    body: BodyModel | null
    setUi: (patch: Partial<SollUiState>) => void
    measureFromIst: () => void
    resetEstimated: () => void
    runHarness: () => void
    harness: SollHarnessResult | null
  }
  onStageClick: (clientX: number, clientY: number) => void
  ghostOverlayRef: React.MutableRefObject<OverlayGhost | null>
  setGhostOverlay: (ghost: OverlayGhost | null) => void
  stageClickEnabled: boolean
  setStageClickEnabled: (enabled: boolean) => void
  stageClickMode: StageClickMode
  setStageClickMode: (mode: StageClickMode) => void
  setStageMounted: (mounted: boolean) => void
}

const FitContext = createContext<FitSession | null>(null)

export function useFit(): FitSession {
  const ctx = useContext(FitContext)
  if (!ctx) throw new Error('useFit must be used inside FitProvider')
  return ctx
}

export function FitProvider({ children }: { children: ReactNode }) {
  const camera = useCamera()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const stillRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef(createPoseEngine())
  const trackerRef = useRef(createPedalTracker())
  const metricsRef = useRef(createMetricsPipeline({ minVisibility: MIN_LANDMARK_VISIBILITY }))
  const captureRef = useRef(
    createMeasurementCapture({
      pipeline: { minVisibility: MIN_LANDMARK_VISIBILITY },
    }),
  )
  const scratchRef = useRef<HTMLCanvasElement | null>(null)

  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>('idle')
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null)
  const [inferenceMs, setInferenceMs] = useState<number | null>(null)
  const [frameSync, setFrameSync] = useState<FitSession['pose']['frameSync']>('idle')
  const [poseSeenAt, setPoseSeenAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => performance.now())
  const [calibration, setCalibration] = useState<BikeCalibration>(() => loadCalibration() ?? emptyCalibration())
  const [activeMark, setActiveMark] = useState<BikeMarkId>('B')
  const [pedalSample, setPedalSample] = useState<PedalSample>(IDLE_PEDAL)
  const [harness, setHarness] = useState<PedalHarnessResult | null>(null)
  const [stageClickEnabled, setStageClickEnabled] = useState(true)
  const [stageClickMode, setStageClickMode] = useState<StageClickMode>('off')
  const [stageMounted, setStageMounted] = useState(false)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [overlayElement, setOverlayElement] = useState<HTMLCanvasElement | null>(null)
  const [playback, setPlayback] = useState<VideoPlayback>(IDLE_PLAYBACK)
  const [frozen, setFrozen] = useState(false)
  const [pedalSelecting, setPedalSelecting] = useState(false)
  const [seedPoint, setSeedPoint] = useState<PixelPoint | null>(null)
  const [metricsReport, setMetricsReport] = useState<MetricsReport>(() => emptyMetricsReport())
  const [captureSnap, setCaptureSnap] = useState<MeasurementSnapshot>(() => emptyMeasurementSnapshot())
  const [metricsHarness, setMetricsHarness] = useState<MetricsHarnessResult | null>(null)
  const [sollUi, setSollUi] = useState<SollUiState>(DEFAULT_SOLL_UI)
  const [sollResult, setSollResult] = useState<SollSolveResult>(emptySollResult)
  const [measuredBody, setMeasuredBody] = useState<BodyModel | null>(null)
  const [sollHarness, setSollHarness] = useState<SollHarnessResult | null>(null)
  const sollBody = measuredBody ?? estimateBodyModel(calibration)
  const calibrationRef = useRef(calibration)
  const sourceRef = useRef(camera.status.source)
  const seededRef = useRef(false)
  const userSeededRef = useRef(false)
  const suppressPoseRef = useRef(false)
  const runtimeFailsRef = useRef(0)
  const poseSeenAtRef = useRef<number | null>(null)
  const ghostOverlayRef = useRef<OverlayGhost | null>(null)
  const sollUiRef = useRef(sollUi)
  const sollBodyRef = useRef(sollBody)
  const clickModeRef = useRef(stageClickMode)
  const seedPointRef = useRef<PixelPoint | null>(null)

  const freshness = poseFreshness(poseSeenAt, nowTick)
  const poseReady = poseIsReady(freshness, poseFrame)

  const currentBinding = useCallback((): CalibrationBinding | null => {
    if (!playback.playable || playback.width < 2 || playback.height < 2) return null
    const geometry = geometryFromStatus(camera.status, playback.width, playback.height)
    return { ...geometry, setupId: makeSetupId(geometry) }
  }, [camera.status, playback.height, playback.playable, playback.width])

  const videoGeometry = useMemo(() => {
    if (!playback.playable) return null
    return geometryFromStatus(camera.status, playback.width, playback.height)
  }, [camera.status, playback.height, playback.playable, playback.width])

  const assessment = useMemo(
    () => assessCalibration(calibration, videoGeometry),
    [calibration, videoGeometry],
  )

  useEffect(() => {
    calibrationRef.current = calibration
    trackerRef.current.setBottomBracket(calibration.marks.B)
  }, [calibration])

  useEffect(() => {
    const cap = captureRef.current.snapshot()
    if (cap.state === 'recording') {
      setCaptureSnap(captureRef.current.abort('calibration_changed'))
    }
  }, [calibration.marks, calibration.transform])

  useEffect(() => {
    if (captureSnap.state !== 'countdown') return
    const timer = window.setInterval(() => {
      setCaptureSnap(captureRef.current.tick(performance.now()))
    }, 100)
    return () => window.clearInterval(timer)
  }, [captureSnap.state])

  useEffect(() => {
    sollUiRef.current = sollUi
  }, [sollUi])

  useEffect(() => {
    sollBodyRef.current = sollBody
  }, [sollBody])

  useEffect(() => {
    clickModeRef.current = stageClickMode
  }, [stageClickMode])

  useEffect(() => {
    seedPointRef.current = seedPoint
  }, [seedPoint])

  useEffect(() => {
    sourceRef.current = camera.status.source
  }, [camera.status.source])

  useEffect(() => {
    poseSeenAtRef.current = poseSeenAt
  }, [poseSeenAt])

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(performance.now()), 160)
    return () => window.clearInterval(id)
  }, [])

  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    if (videoRef.current && videoRef.current !== el) {
      detachStreamFromVideo(videoRef.current)
    }
    videoRef.current = el
    setVideoElement(el)
  }, [])

  const attachOverlay = useCallback((el: HTMLCanvasElement | null) => {
    overlayRef.current = el
    setOverlayElement(el)
  }, [])

  const attachStill = useCallback((el: HTMLCanvasElement | null) => {
    stillRef.current = el
  }, [])

  const restart = useCallback(async () => {
    const deviceId = camera.status.deviceId ?? undefined
    const source = camera.status.source
    camera.stop()
    if (source === 'synthetic') {
      camera.startSynthetic()
      return
    }
    await camera.start(deviceId)
  }, [camera])

  useEffect(() => {
    const video = videoElement
    if (!video) {
      setPlayback(IDLE_PLAYBACK)
      return
    }
    let cancelled = false
    let playError: string | null = null
    const publish = () => {
      if (cancelled) return
      setPlayback({
        playable: isVideoPlayable(video) && !playError,
        width: video.videoWidth,
        height: video.videoHeight,
        playError,
      })
    }
    void attachStreamToVideo(video, camera.stream).then((result) => {
      playError = result.playError
      if (!cancelled) setPlayback(result)
    })
    video.addEventListener('loadedmetadata', publish)
    video.addEventListener('playing', publish)
    video.addEventListener('resize', publish)
    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', publish)
      video.removeEventListener('playing', publish)
      video.removeEventListener('resize', publish)
    }
  }, [camera.stream, videoElement])

  useEffect(() => {
    const binding = currentBinding()
    if (!binding) return
    setCalibration((prev) => {
      if (prev.binding?.setupId === binding.setupId) return prev
      if (prev.binding && prev.binding.setupId !== binding.setupId) {
        return emptyCalibration(binding)
      }
      return { ...prev, binding }
    })
    setFrozen(false)
    clearStillFrame(stillRef.current)
  }, [currentBinding])

  useEffect(() => {
    engineRef.current.bumpSession()
    runtimeFailsRef.current = 0
    setPoseFrame(null)
    setPoseSeenAt(null)
    setInferenceMs(null)
    seededRef.current = false
    userSeededRef.current = false
    setSeedPoint(null)
    trackerRef.current.reset()
    setPedalSample(IDLE_PEDAL)
  }, [camera.stream])

  useEffect(() => {
    if (camera.stream && playback.playable) return
    setPoseFrame(null)
    setPoseSeenAt(null)
  }, [camera.stream, playback.playable])

  useEffect(() => {
    let cancelled = false
    const engine = createPoseEngine()
    engineRef.current = engine
    engine.onError((message) => {
      if (cancelled) return
      setWorkerStatus('error')
      setWorkerError(message)
      setPoseFrame(null)
      setPoseSeenAt(null)
    })
    setWorkerStatus('loading')
    void engine
      .init()
      .then(() => {
        if (!cancelled) {
          setWorkerStatus('WORKER_READY')
          setWorkerError(null)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setWorkerStatus('error')
        setWorkerError(error instanceof Error ? error.message : 'Pose worker failed to start.')
      })
    return () => {
      cancelled = true
      void engine.dispose()
    }
  }, [])

  const retryWorker = useCallback(async () => {
    setWorkerStatus('loading')
    setWorkerError(null)
    setPoseFrame(null)
    setPoseSeenAt(null)
    runtimeFailsRef.current = 0
    try {
      await engineRef.current.retry()
      setWorkerStatus('WORKER_READY')
    } catch (error: unknown) {
      setWorkerStatus('error')
      setWorkerError(error instanceof Error ? error.message : 'Pose worker failed to start.')
    }
  }, [])

  const simulateLoss = useCallback(() => {
    suppressPoseRef.current = true
    setPoseFrame(null)
    setPoseSeenAt(performance.now() - POSE_LOST_MS)
    window.setTimeout(() => {
      suppressPoseRef.current = false
    }, 2800)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!stageMounted || !video || !overlay || !camera.stream || !playback.playable) {
      setFrameSync('idle')
      return
    }

    seededRef.current = userSeededRef.current
    trackerRef.current.setBottomBracket(calibrationRef.current.marks.B)
    metricsRef.current.reset()
    setMetricsReport(emptyMetricsReport())
    const cap = captureRef.current.snapshot()
    if (cap.state === 'recording' || cap.state === 'countdown') {
      setCaptureSnap(captureRef.current.abort('camera_swap'))
    }
    setFrameSync(typeof video.requestVideoFrameCallback === 'function' ? 'rvfc' : 'raf')

    let metricsSnapAt = 0
    const loop = startVideoFrameLoop(video, async ({ bitmap, preview, timestampMs, videoWidth, videoHeight }) => {
      sizeOverlayToVideo(video, overlay)
      const ctx = overlay.getContext('2d')
      if (!ctx) {
        bitmap.close()
        preview.close()
        return
      }

      let scratch = scratchRef.current
      if (!scratch) {
        scratch = document.createElement('canvas')
        scratchRef.current = scratch
      }
      if (scratch.width !== preview.width) scratch.width = preview.width
      if (scratch.height !== preview.height) scratch.height = preview.height
      const sctx = scratch.getContext('2d', { willReadFrequently: true })
      let imageData: ImageData | null = null
      if (sctx) {
        sctx.drawImage(preview, 0, 0)
        imageData = sctx.getImageData(0, 0, preview.width, preview.height)
      }
      preview.close()

      let sample: PedalSample | null = null
      if (imageData) {
        if (!seededRef.current && !userSeededRef.current && clickModeRef.current !== 'pedal') {
          const found = findMagentaMarker(imageData)
          if (found) {
            trackerRef.current.seed(found.x, found.y)
            seededRef.current = true
            setSeedPoint(found)
          }
        }
        sample = trackerRef.current.update(imageData, timestampMs)
        setPedalSample(sample)
      }

      const synthetic = sourceRef.current === 'synthetic'
      let next: PoseFrame | null = null
      if (suppressPoseRef.current) {
        bitmap.close()
        next = null
      } else if (synthetic) {
        bitmap.close()
        const fixture = syntheticPoseFrame(timestampMs)
        next = { ...fixture, videoWidth, videoHeight, timestampMs }
      } else {
        const detected = await engineRef.current.detectVideo(bitmap, timestampMs)
        next = detected && detected.landmarks.length > 0 ? detected : null
      }

      if (next) {
        if (!next.nearSide) {
          next.nearSide = inferNearSide(next.landmarks, MIN_LANDMARK_VISIBILITY)
        }
        runtimeFailsRef.current = 0
        setPoseFrame(next)
        setPoseSeenAt(timestampMs)
        setInferenceMs(next.inferenceMs ?? null)
      } else {
        runtimeFailsRef.current += 1
        const last = poseSeenAtRef.current
        if (last !== null && timestampMs - last >= POSE_LOST_MS) {
          setPoseFrame(null)
        }
        if (!synthetic && runtimeFailsRef.current >= POSE_RUNTIME_FAIL_LIMIT) {
          setWorkerStatus('error')
          setWorkerError('Pose-Erkennung antwortet nicht (Timeout). Erneut versuchen.')
        }
      }

      const liveFresh = poseFreshness(next ? timestampMs : poseSeenAtRef.current, timestampMs)
      const overlayFrame = liveFresh.status === 'lost' ? null : next
      drawIstOverlay(ctx, overlayFrame, calibrationRef.current, calibrationRef.current.transform, sample)

      const ui = sollUiRef.current
      const body = sollBodyRef.current ?? emptyBodyModel()
      const phase01 =
        ui.phaseSource === 'synthetic' && ui.syntheticPlaying
          ? syntheticPhase01(timestampMs)
          : ui.syntheticPhase01
      const solved = solveSoll({
        mode: ui.mode,
        calibration: calibrationRef.current,
        pedal: sample,
        phaseSource: ui.phaseSource,
        syntheticPhase01: phase01,
        body: scaledBodyModel(body, ui.limbScale),
      })
      setSollResult(solved)
      drawSollOverlay(ctx, solved, ui)

      const ghost = ghostOverlayRef.current
      if (ghost && !solved.skeleton) drawGhostOverlay(ctx, ghost)

      drawPedalSelection(ctx, sample?.pixel ?? seedPointRef.current, sample?.status ?? 'idle')

      if (sample) {
        const frame = {
          timestampMs,
          pose: overlayFrame,
          pedal: sample,
          transform: calibrationRef.current.transform,
        }
        metricsRef.current.push(frame)
        const capState = captureRef.current.snapshot().state
        if (capState === 'recording') {
          const nextSnap = captureRef.current.push(frame)
          if (nextSnap.state === 'finished' || nextSnap.frozen) {
            setCaptureSnap(nextSnap)
          }
        }
        if (timestampMs - metricsSnapAt >= 200 || metricsSnapAt === 0) {
          metricsSnapAt = timestampMs
          setMetricsReport(metricsRef.current.snapshot())
          setCaptureSnap(captureRef.current.snapshot())
        }
      }
    })

    return () => {
      loop.stop()
    }
  }, [camera.stream, overlayElement, playback.playable, stageMounted, videoElement])

  const placeMark = useCallback(
    (id: BikeMarkId, point: PixelPoint) => {
      const binding = currentBinding()
      setCalibration((prev) => {
        const marks = { ...prev.marks, [id]: point }
        return {
          ...prev,
          marks,
          transform: computePixelBikeTransform(marks),
          updatedAt: new Date().toISOString(),
          binding: binding ?? prev.binding ?? null,
        }
      })
    },
    [currentBinding],
  )

  const seedAt = useCallback((point: PixelPoint) => {
    trackerRef.current.seed(point.x, point.y)
    seededRef.current = true
    userSeededRef.current = true
    setSeedPoint(point)
  }, [])

  const onStageClick = useCallback(
    (clientX: number, clientY: number) => {
      const video = videoRef.current
      if (!video) return
      const point = clientToVideoPixel(video, clientX, clientY)
      if (!point) return
      if (stageClickMode === 'pedal' || pedalSelecting) {
        seedAt(point)
        return
      }
      if (stageClickMode === 'off') return
      placeMark(activeMark, point)
      if (activeMark === 'B') setActiveMark('S')
      else if (activeMark === 'S') setActiveMark('G')
    },
    [activeMark, pedalSelecting, placeMark, seedAt, stageClickMode],
  )

  const toggleFreeze = useCallback(() => {
    setFrozen((prev) => {
      const next = !prev
      const video = videoRef.current
      const still = stillRef.current
      if (next && video && still) {
        captureStillFrame(video, still)
      } else {
        clearStillFrame(still)
      }
      return next
    })
  }, [])

  const clearFreeze = useCallback(() => {
    setFrozen(false)
    clearStillFrame(stillRef.current)
  }, [])

  const knee = useMemo<KneeAngleReading>(() => {
    const frame = freshness.status === 'lost' ? null : poseFrame
    if (!frame) return { definition: 'flexion', degrees: null, visible: false }
    const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
    const hip = visibleJoint(frame.landmarks, near, 'HIP', MIN_LANDMARK_VISIBILITY)
    const kneeLm = visibleJoint(frame.landmarks, near, 'KNEE', MIN_LANDMARK_VISIBILITY)
    const ankle = visibleJoint(frame.landmarks, near, 'ANKLE', MIN_LANDMARK_VISIBILITY)
    const toPx = (lm: { x: number; y: number } | null) =>
      lm ? landmarkToPixel(lm, frame.videoWidth, frame.videoHeight) : null
    return measureKneeAngle(toPx(hip), toPx(kneeLm), toPx(ankle), 'flexion')
  }, [freshness.status, poseFrame])

  const setGhostOverlay = useCallback((ghost: OverlayGhost | null) => {
    ghostOverlayRef.current = ghost
  }, [])

  const allowFixture = camera.status.source === 'synthetic' && camera.status.permission === 'granted'

  const value = useMemo<FitSession>(
    () => ({
      camera: {
        status: camera.status,
        stream: camera.stream,
        start: camera.start,
        stop: camera.stop,
        restart,
        startSynthetic: camera.startSynthetic,
        allowSynthetic: ALLOW_SYNTHETIC_FIXTURE,
        playback,
      },
      videoRef,
      overlayRef,
      attachVideo,
      attachOverlay,
      attachStill,
      pose: {
        workerStatus,
        workerError,
        frame: freshness.status === 'lost' ? null : poseFrame,
        inferenceMs,
        nearSide: poseFrame?.nearSide ?? '—',
        frameSync,
        freshness,
        ready: poseReady,
        retry: retryWorker,
        simulateLoss,
      },
      calibration: {
        data: calibration,
        activeMark,
        setActiveMark,
        placeMark,
        clearMarks: () => setCalibration(emptyCalibration(currentBinding())),
        applyFixtureMarks: () => {
          if (!allowFixture) return
          const marks = { B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G }
          setCalibration((prev) => ({
            ...prev,
            marks,
            transform: computePixelBikeTransform(marks),
            updatedAt: new Date().toISOString(),
            binding: currentBinding() ?? prev.binding ?? null,
          }))
        },
        save: () => setCalibration((prev) => saveCalibration(prev)),
        load: () => {
          const loaded = loadCalibration()
          if (loaded) setCalibration(loaded)
        },
        knee,
        frozen,
        toggleFreeze,
        clearFreeze,
        allowFixture,
        assessment,
      },
      pedal: {
        sample: pedalSample,
        harness,
        runHarness: () => setHarness(runTenRevolutionHarness()),
        seedAt,
        reset: () => {
          trackerRef.current.reset()
          trackerRef.current.setBottomBracket(calibration.marks.B)
          seededRef.current = false
          userSeededRef.current = false
          setSeedPoint(null)
          setPedalSample(IDLE_PEDAL)
          metricsRef.current.reset()
          setMetricsReport(emptyMetricsReport())
          const cap = captureRef.current.snapshot()
          if (cap.state === 'recording' || cap.state === 'countdown') {
            setCaptureSnap(captureRef.current.abort('reset'))
          }
        },
        selecting: pedalSelecting,
        setSelecting: setPedalSelecting,
        seedPoint,
      },
      metrics: {
        report: metricsReport,
        capture: captureSnap,
        startCountdown: (seconds, nowMs) => {
          setCaptureSnap(captureRef.current.startCountdown(nowMs, seconds))
        },
        tickCapture: (nowMs) => {
          setCaptureSnap(captureRef.current.tick(nowMs))
        },
        beginRecording: () => {
          setCaptureSnap(captureRef.current.beginRecording())
        },
        finishRecording: () => {
          const snap = captureRef.current.finish()
          setCaptureSnap(snap)
          return snap
        },
        abortRecording: (reason) => {
          setCaptureSnap(captureRef.current.abort(reason))
        },
        resetCapture: () => {
          setCaptureSnap(captureRef.current.reset())
        },
        harness: metricsHarness,
        runHarness: () => setMetricsHarness(runMetricsHarness()),
        reset: () => {
          metricsRef.current.reset()
          setMetricsReport(emptyMetricsReport())
        },
      },
      soll: {
        result: sollResult,
        ui: sollUi,
        body: sollBody,
        setUi: (patch) => setSollUi((prev) => ({ ...prev, ...patch })),
        measureFromIst: () => {
          if (!poseFrame || freshness.status === 'lost') return
          const measured = measureBodyFromIst(poseFrame, calibration)
          if (measured) setMeasuredBody(measured)
        },
        resetEstimated: () => setMeasuredBody(null),
        runHarness: () => setSollHarness(runSollHarness()),
        harness: sollHarness,
      },
      onStageClick,
      ghostOverlayRef,
      setGhostOverlay,
      stageClickEnabled,
      setStageClickEnabled,
      stageClickMode,
      setStageClickMode,
      setStageMounted,
    }),
    [
      activeMark,
      allowFixture,
      assessment,
      attachOverlay,
      attachStill,
      attachVideo,
      calibration,
      camera,
      currentBinding,
      frameSync,
      freshness,
      frozen,
      harness,
      inferenceMs,
      knee,
      metricsHarness,
      metricsReport,
      captureSnap,
      onStageClick,
      pedalSample,
      pedalSelecting,
      placeMark,
      playback,
      poseFrame,
      poseReady,
      restart,
      retryWorker,
      seedAt,
      seedPoint,
      setGhostOverlay,
      simulateLoss,
      sollBody,
      sollHarness,
      sollResult,
      sollUi,
      stageClickEnabled,
      stageClickMode,
      toggleFreeze,
      clearFreeze,
      workerError,
      workerStatus,
    ],
  )

  return <FitContext.Provider value={value}>{children}</FitContext.Provider>
}
