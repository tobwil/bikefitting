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
import { attachFileToVideo, attachStreamToVideo, detachStreamFromVideo, isVideoPlayable } from '../camera/attachStream.ts'
import { geometryFromStatus, makeSetupId } from '../camera/setupId.ts'
import { useCamera } from '../camera/useCamera.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { drawProposal } from '../calibration/drawProposal.ts'
import { measureKneeAngle } from '../calibration/kneeAngle.ts'
import type { PixelImage } from '../calibration/pixels.ts'
import { createDetectEngine } from '../calibration/detectEngine.ts'
import {
  applyConfirmed,
  beginDetectRun,
  cancelDetectRun,
  confirmGripContact,
  confirmGripOnCalibration,
  confirmProposal,
  correctPoint,
  emptyDetectSession,
  failToManual,
  fallbackManual,
  lockDetect,
  manualProvenance,
  restoreDetectGrip,
  selectCandidate,
  selectedPoints,
  sessionFromDetect,
  updateDetectProgress,
  type DetectSession,
} from '../calibration/propose.ts'
import { emptyCalibration, loadCalibration, saveCalibration } from '../calibration/storage.ts'
import { captureStillFrame, clearStillFrame, readStillPixels } from '../calibration/stillFrame.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { assessCalibration } from '../calibration/validity.ts'
import { drawPedalSelection } from '../pedal/drawSeed.ts'
import { createPedalTracker, findMagentaMarker } from '../pedal/tracker.ts'
import { runTenRevolutionHarness } from '../pedal/harness.ts'
import type { PedalHarnessResult } from '../pedal/harness.ts'
import {
  createMeasurementCapture,
  createMetricsPipeline,
  createPhaseCapture,
  emptyMeasurementSnapshot,
  emptyMetricsReport,
  encodePhaseStill,
  nearestPhaseId,
  pedalAngleDeg,
  runMetricsHarness,
} from '../metrics/index.ts'
import type { MeasurementSnapshot, MetricsHarnessResult } from '../metrics/index.ts'
import type { MetricsReport } from '../types/metrics.ts'
import type { PhaseEvidence } from '../types/phase.ts'
import { createPoseEngine } from '../pose/createPoseEngine.ts'
import { drawIstOverlay, landmarkToPixel } from '../pose/drawIst.ts'
import { drawFootOverlay } from '../foot/drawFoot.ts'
import { createFootCollector, emptyFootDiagnostic } from '../foot/diagnostic.ts'
import type { FootCycleDiagnostic } from '../types/foot.ts'
import type { PlaneScale, ScalePlaceTarget } from '../types/scale.ts'
import { EMPTY_SCALE_DRAFT, type ScaleDraftState } from '../scale/ScalePanel.tsx'
import {
  commitCheckedScale,
  draftReference,
  emptyPlaneScale,
  runIndependentCheck,
  storeDraftScale,
} from '../scale/plane.ts'
import { loadStoredScale, saveStoredScale } from '../scale/parse.ts'
import {
  applyDetectToRuntimeFails,
  poseFreshness,
  poseHoldForSource,
  poseIsReady,
  poseReceiveTime,
  shouldMarkWorkerTimeout,
  POSE_LOST_MS,
  type PoseFreshness,
} from '../pose/freshness.ts'
import type { PoseDetectStatus } from '../types/pose-engine.ts'
import { startVideoFrameLoop } from '../pose/frameSync.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import {
  EMPTY_OVERLAY_FILTER_STATUS,
  OverlayPoseFilter,
  overlayFilterFromSearch,
  poseForMetrics,
  type OverlayFilterStatus,
} from '../pose/overlayFilter.ts'
import {
  EMPTY_MEASURE_SIDE_STATUS,
  MeasureSideLock,
  type MeasureSideStatus,
} from '../pose/measureSideLock.ts'
import { kneeDegFromPose } from '../pose/overlayEval.ts'
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
  GripKind,
  KneeAngleReading,
  PixelPoint,
} from '../types/calibration.ts'
import type { CameraStatus, VideoPlayback } from '../types/camera.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { BodyModel, SollSolveResult, SollUiState } from '../types/soll.ts'
import { drawGhostOverlay, type OverlayGhost } from './drawGhost.ts'
import { clientToVideoPixel, sizeOverlayToVideo } from './videoCoords.ts'
import type { FilePlaybackSnapshot, LocalFileMeta, SourceTransform } from '../types/file.ts'
import { IDENTITY_SOURCE_TRANSFORM } from '../types/file.ts'
import {
  blitWorkingFrame,
  drawSourceTransform,
  isIdentityTransform,
  nextRotation,
  remapLandmarksToOriginal,
  sourceTransformForCapture,
} from '../file/frameTransform.ts'
import { isSameFileBind, isSameStreamBind } from '../file/meta.ts'
import { applyFileTransportSeek, applySeekReset, resetCaptureSegment } from '../file/seekReset.ts'
import {
  pauseFile,
  playFile,
  presentFilePlayback,
  restartFile,
  seekFile,
  snapshotPlayback,
  stepFileFrame,
} from '../file/playback.ts'
import { SEEK_RESET_GAP_MS } from '../file/mediaClock.ts'
import { cycleMeasurementAllowed } from '../file/staticCheck.ts'

export type WorkerStatus = 'idle' | 'loading' | 'WORKER_READY' | 'error'
export type StageClickMode = 'off' | 'calibrate' | 'pedal'

const IDLE_PLAYBACK: VideoPlayback = {
  playable: false,
  width: 0,
  height: 0,
  playError: null,
}

const IDLE_FILE_PLAYBACK: FilePlaybackSnapshot = {
  paused: true,
  ended: false,
  currentTimeMs: 0,
  durationMs: 0,
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
    file: LocalFileMeta | null
    startFile: (file: File) => Promise<void>
    replay: FilePlaybackSnapshot
    transform: SourceTransform
    rotate: () => void
    setCrop: (crop: SourceTransform['crop']) => void
    play: () => void
    pause: () => void
    seek: (timeSec: number) => void
    stepFrame: (direction: -1 | 1) => void
    restartReplay: () => void
    staticCheck: boolean
    mediaRange: { start: number; end: number } | null
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
    /** Product path stays Lite. Full is lab-compare only. */
    model: 'lite'
    overlayFilter: {
      enabled: boolean
      setEnabled: (enabled: boolean) => void
      needsNewTake: boolean
      occludedNearSide: boolean
      lockedSide: string | null
      compare: {
        rawDeg: number | null
        filteredDeg: number | null
        deltaDeg: number | null
      }
    }
    /** Capture-scoped L/R lock — independent of the lab overlay toggle. */
    measureSide: {
      lockedSide: string | null
      needsNewTake: boolean
      occludedLockedSide: boolean
    }
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
    detect: DetectSession
    stillImage: PixelImage | null
    recognizeBike: () => void
    cancelRecognize: () => void
    confirmPoints: () => void
    selectBike: (id: string) => void
    fallbackManual: () => void
    correctDetectPoint: (id: BikeMarkId, point: PixelPoint) => void
    confirmGrip: (kind: GripKind) => void
  }
  scale: {
    data: PlaneScale
    draft: ScaleDraftState
    placing: ScalePlaceTarget | null
    message: string | null
    setDraft: (patch: Partial<ScaleDraftState>) => void
    setPlacing: (target: ScalePlaceTarget | null) => void
    storeDraft: () => void
    runCheck: () => void
    clear: () => void
  }
  foot: {
    diagnostic: FootCycleDiagnostic
    takeSnapshot: (scale?: PlaneScale | null) => FootCycleDiagnostic
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
    takePhaseEvidence: () => PhaseEvidence | null
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
  const detectEngineRef = useRef(createDetectEngine())
  const trackerRef = useRef(createPedalTracker())
  const metricsRef = useRef(createMetricsPipeline({ minVisibility: MIN_LANDMARK_VISIBILITY }))
  const captureRef = useRef(
    createMeasurementCapture({
      pipeline: { minVisibility: MIN_LANDMARK_VISIBILITY },
    }),
  )
  const phaseCaptureRef = useRef(createPhaseCapture())
  const phaseEvidenceRef = useRef<PhaseEvidence | null>(null)
  const nearSideRef = useRef<'left' | 'right'>('right')
  const scratchRef = useRef<HTMLCanvasElement | null>(null)
  const overlayFilterRef = useRef(new OverlayPoseFilter())
  const measureSideLockRef = useRef(new MeasureSideLock())
  const measureSideStatusRef = useRef<MeasureSideStatus>(EMPTY_MEASURE_SIDE_STATUS)
  const footCollectorRef = useRef(createFootCollector())
  const scalePlacingRef = useRef<ScalePlaceTarget | null>(null)
  const planeScaleRef = useRef<PlaneScale>(emptyPlaneScale())
  const overlayFilterOnRef = useRef(false)
  const overlayStatusRef = useRef<OverlayFilterStatus>(EMPTY_OVERLAY_FILTER_STATUS)

  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>('idle')
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null)
  const [inferenceMs, setInferenceMs] = useState<number | null>(null)
  const [frameSync, setFrameSync] = useState<FitSession['pose']['frameSync']>('idle')
  const [poseSeenAt, setPoseSeenAt] = useState<number | null>(null)
  const [nowTick, setNowTick] = useState(() => performance.now())
  const [overlayFilterOn, setOverlayFilterOn] = useState(() => overlayFilterFromSearch(window.location.search))
  const [overlayFilterStatus, setOverlayFilterStatus] = useState<OverlayFilterStatus>(EMPTY_OVERLAY_FILTER_STATUS)
  const [overlayCompare, setOverlayCompare] = useState<{
    rawDeg: number | null
    filteredDeg: number | null
    deltaDeg: number | null
  }>({ rawDeg: null, filteredDeg: null, deltaDeg: null })
  const [measureSideStatus, setMeasureSideStatus] = useState<MeasureSideStatus>(EMPTY_MEASURE_SIDE_STATUS)
  const [calibration, setCalibration] = useState<BikeCalibration>(() => loadCalibration() ?? emptyCalibration())
  const [planeScale, setPlaneScale] = useState<PlaneScale>(() => loadStoredScale())
  const [scaleDraft, setScaleDraft] = useState<ScaleDraftState>(EMPTY_SCALE_DRAFT)
  const [scalePlacing, setScalePlacing] = useState<ScalePlaceTarget | null>(null)
  const [scaleMessage, setScaleMessage] = useState<string | null>(null)
  const [footDiagnostic, setFootDiagnostic] = useState<FootCycleDiagnostic>(() => emptyFootDiagnostic())
  const [detect, setDetect] = useState<DetectSession>(() =>
    restoreDetectGrip(emptyDetectSession(), loadCalibration() ?? emptyCalibration()),
  )
  const [stillImage, setStillImage] = useState<PixelImage | null>(null)
  const [activeMark, setActiveMark] = useState<BikeMarkId>('B')
  const [pedalSample, setPedalSample] = useState<PedalSample>(IDLE_PEDAL)
  const [harness, setHarness] = useState<PedalHarnessResult | null>(null)
  const [stageClickEnabled, setStageClickEnabled] = useState(true)
  const [stageClickMode, setStageClickMode] = useState<StageClickMode>('off')
  const [stageMounted, setStageMounted] = useState(false)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [overlayElement, setOverlayElement] = useState<HTMLCanvasElement | null>(null)
  const [playback, setPlayback] = useState<VideoPlayback>(IDLE_PLAYBACK)
  const [fileReplay, setFileReplay] = useState<FilePlaybackSnapshot>(IDLE_FILE_PLAYBACK)
  const [sourceTransform, setSourceTransform] = useState<SourceTransform>(IDENTITY_SOURCE_TRANSFORM)
  const [mediaRange, setMediaRange] = useState<{ start: number; end: number } | null>(null)
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
  const detectRef = useRef(detect)
  const detectBeforeRunRef = useRef<DetectSession>(emptyDetectSession())
  const imageGenerationRef = useRef(0)
  const detectRunRef = useRef(0)
  const setupIdRef = useRef<string | null>(null)
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
  const scaleDraftRef = useRef(scaleDraft)
  const seedPointRef = useRef<PixelPoint | null>(null)
  const transformRef = useRef(sourceTransform)
  const workingRef = useRef<HTMLCanvasElement | null>(null)
  const mediaRangeRef = useRef<{ start: number; end: number } | null>(null)
  const fileKindRef = useRef(camera.file?.kind ?? null)

  const fileStaticCheck =
    camera.status.source === 'file' &&
    (camera.file?.kind === 'image' || !cycleMeasurementAllowed(camera.file?.kind))
  const freshness = poseFreshness(poseSeenAt, nowTick, {
    hold: poseHoldForSource({
      source: camera.status.source,
      paused: fileReplay.paused,
      staticCheck: fileStaticCheck,
    }),
  })
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
    detectRef.current = detect
  }, [detect])

  useEffect(() => {
    scalePlacingRef.current = scalePlacing
  }, [scalePlacing])

  useEffect(() => {
    planeScaleRef.current = planeScale
  }, [planeScale])

  useEffect(() => {
    scaleDraftRef.current = scaleDraft
  }, [scaleDraft])

  useEffect(() => {
    if (captureRef.current.getState() === 'recording') {
      phaseCaptureRef.current.reset()
      phaseEvidenceRef.current = null
      setCaptureSnap(captureRef.current.abort('calibration_changed'))
    }
  }, [calibration.marks, calibration.transform])

  useEffect(() => {
    const busy = captureSnap.state === 'recording' || captureSnap.state === 'countdown'
    setDetect((prev) => (prev.locked === busy ? prev : lockDetect(prev, busy)))
  }, [captureSnap.state])

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
    transformRef.current = sourceTransform
  }, [sourceTransform])

  useEffect(() => {
    fileKindRef.current = camera.file?.kind ?? null
  }, [camera.file?.kind])

  useEffect(() => {
    sourceRef.current = camera.status.source
  }, [camera.status.source])

  useEffect(() => {
    setSourceTransform(IDENTITY_SOURCE_TRANSFORM)
    mediaRangeRef.current = null
    setMediaRange(null)
  }, [camera.status.source, camera.file?.objectUrl, camera.file?.name])

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
    if (source === 'file') {
      const video = videoRef.current
      if (video) restartFile(video)
      return
    }
    camera.stop()
    if (source === 'synthetic') {
      camera.startSynthetic()
      return
    }
    await camera.start(deviceId)
  }, [camera])

  const fileObjectUrl = camera.file?.objectUrl ?? null
  const fileKind = camera.file?.kind ?? null

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
    const patchBoundFile = (width: number, height: number) => {
      if (cancelled || camera.status.source !== 'file' || !camera.file) return
      camera.patchFile({
        width: width || camera.file.width,
        height: height || camera.file.height,
        durationMs:
          camera.file.kind === 'image'
            ? 0
            : Number.isFinite(video.duration)
              ? video.duration * 1000
              : camera.file.durationMs,
      })
      if (camera.file.kind === 'image') pauseFile(video)
      setFileReplay(snapshotPlayback(video))
    }

    const fileVideo = camera.status.source === 'file' && fileKind === 'video' && fileObjectUrl
    const alreadyBound =
      (fileVideo && isSameFileBind(video, fileObjectUrl)) ||
      (!fileVideo && isSameStreamBind(video, camera.stream))

    if (alreadyBound) {
      publish()
      patchBoundFile(video.videoWidth, video.videoHeight)
    } else {
      void (
        fileVideo ? attachFileToVideo(video, fileObjectUrl) : attachStreamToVideo(video, camera.stream)
      ).then((result) => {
        playError = result.playError
        if (!cancelled) setPlayback(result)
        patchBoundFile(result.width, result.height)
      })
    }
    video.addEventListener('loadedmetadata', publish)
    video.addEventListener('playing', publish)
    video.addEventListener('resize', publish)
    const onTime = () => {
      if (cancelled || camera.status.source !== 'file') return
      setFileReplay(snapshotPlayback(video))
    }
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('seeked', onTime)
    video.addEventListener('pause', onTime)
    video.addEventListener('play', onTime)
    video.addEventListener('ended', onTime)
    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', publish)
      video.removeEventListener('playing', publish)
      video.removeEventListener('resize', publish)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('seeked', onTime)
      video.removeEventListener('pause', onTime)
      video.removeEventListener('play', onTime)
      video.removeEventListener('ended', onTime)
    }
  }, [fileObjectUrl, fileKind, camera.patchFile, camera.status.source, camera.stream, videoElement])

  useEffect(() => {
    const binding = currentBinding()
    if (!binding) return
    if (setupIdRef.current && setupIdRef.current !== binding.setupId) {
      detectRunRef.current += 1
      detectEngineRef.current.cancel()
      setDetect(emptyDetectSession())
      setStillImage(null)
      setPlaneScale(emptyPlaneScale())
      setScaleDraft(EMPTY_SCALE_DRAFT)
      setScalePlacing(null)
      footCollectorRef.current.reset()
      setFootDiagnostic(emptyFootDiagnostic())
    }
    setupIdRef.current = binding.setupId
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
    overlayFilterOnRef.current = overlayFilterOn
    if (!overlayFilterOn) {
      overlayFilterRef.current.reset()
      overlayStatusRef.current = EMPTY_OVERLAY_FILTER_STATUS
      setOverlayFilterStatus(EMPTY_OVERLAY_FILTER_STATUS)
      setOverlayCompare({ rawDeg: null, filteredDeg: null, deltaDeg: null })
      // Measure-side lock must not depend on the lab overlay toggle.
    }
  }, [overlayFilterOn])

  const setOverlayFilterEnabled = useCallback((enabled: boolean) => {
    overlayFilterRef.current.reset()
    setOverlayFilterOn(enabled)
  }, [])

  useEffect(() => {
    engineRef.current.bumpSession()
    runtimeFailsRef.current = 0
    overlayFilterRef.current.reset()
    measureSideLockRef.current.reset()
    measureSideStatusRef.current = EMPTY_MEASURE_SIDE_STATUS
    overlayStatusRef.current = EMPTY_OVERLAY_FILTER_STATUS
    setOverlayFilterStatus(EMPTY_OVERLAY_FILTER_STATUS)
    setMeasureSideStatus(EMPTY_MEASURE_SIDE_STATUS)
    setOverlayCompare({ rawDeg: null, filteredDeg: null, deltaDeg: null })
    setPoseFrame(null)
    setPoseSeenAt(null)
    setInferenceMs(null)
    seededRef.current = false
    userSeededRef.current = false
    setSeedPoint(null)
    trackerRef.current.reset()
    setPedalSample(IDLE_PEDAL)
  }, [fileObjectUrl, camera.stream])

  useEffect(() => {
    if ((camera.stream || fileObjectUrl) && playback.playable) return
    setPoseFrame(null)
    setPoseSeenAt(null)
  }, [fileObjectUrl, camera.stream, playback.playable])

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

  useEffect(() => {
    const engine = detectEngineRef.current
    return () => engine.dispose()
  }, [])

  const retryWorker = useCallback(async () => {
    setWorkerStatus('loading')
    setWorkerError(null)
    setPoseFrame(null)
    setPoseSeenAt(null)
    runtimeFailsRef.current = 0
    overlayFilterRef.current.reset()
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
    overlayFilterRef.current.reset()
    overlayStatusRef.current = EMPTY_OVERLAY_FILTER_STATUS
    setOverlayFilterStatus(EMPTY_OVERLAY_FILTER_STATUS)
    setPoseFrame(null)
    setPoseSeenAt(performance.now() - POSE_LOST_MS)
    window.setTimeout(() => {
      suppressPoseRef.current = false
    }, 2800)
  }, [])

  const resetTimeDependentSegment = useCallback(() => {
    resetCaptureSegment({
      resetMetricsAggregator: () => {
        const state = captureRef.current.getState()
        if (state === 'recording' || state === 'countdown') {
          setCaptureSnap(captureRef.current.openNewSegment())
        }
      },
      resetPhaseCapture: () => {
        phaseCaptureRef.current.reset()
      },
      clearPhaseEvidence: () => {
        phaseEvidenceRef.current = null
      },
      resetFoot: () => {
        footCollectorRef.current.reset()
        setFootDiagnostic(emptyFootDiagnostic())
      },
      resetMediaRange: () => {
        mediaRangeRef.current = null
        setMediaRange(null)
      },
      resetMeasureSideLock: () => {
        measureSideLockRef.current.reset()
        measureSideStatusRef.current = EMPTY_MEASURE_SIDE_STATUS
        setMeasureSideStatus(EMPTY_MEASURE_SIDE_STATUS)
      },
    })
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    const fileVideo = camera.status.source === 'file' && camera.file?.kind === 'video' && Boolean(camera.file.objectUrl)
    const sourceReady = Boolean(camera.stream) || fileVideo
    if (!stageMounted || !video || !overlay || !sourceReady || !playback.playable) {
      setFrameSync('idle')
      const ctx = overlay?.getContext('2d')
      if (ctx && overlay) ctx.clearRect(0, 0, overlay.width, overlay.height)
      return
    }

    seededRef.current = userSeededRef.current
    trackerRef.current.setBottomBracket(calibrationRef.current.marks.B)
    overlayFilterRef.current.reset()
    measureSideLockRef.current.reset()
    measureSideStatusRef.current = EMPTY_MEASURE_SIDE_STATUS
    metricsRef.current.reset()
    setMetricsReport(emptyMetricsReport())
    const cap = captureRef.current.snapshot()
    if (cap.state === 'recording' || cap.state === 'countdown') {
      phaseCaptureRef.current.reset()
      phaseEvidenceRef.current = null
      setCaptureSnap(captureRef.current.abort('camera_swap'))
    }
    setFrameSync(typeof video.requestVideoFrameCallback === 'function' ? 'rvfc' : 'raf')
    const fileClock = camera.status.source === 'file'

    let metricsSnapAt = 0
    let overlaySnapAt = 0
    const loop = startVideoFrameLoop(
      video,
      async ({ bitmap, preview, timestampMs, mediaTimeMs, videoWidth, videoHeight }) => {
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

      const transform = sourceTransformForCapture(sourceRef.current, transformRef.current)
      const identity = isIdentityTransform(transform)
      if (!identity) {
        let working = workingRef.current
        if (!working) {
          working = document.createElement('canvas')
          workingRef.current = working
        }
        if (blitWorkingFrame(preview, videoWidth, videoHeight, transform, working)) {
          bitmap.close()
          bitmap = await createImageBitmap(working)
        }
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
      const staticCheck = fileKindRef.current === 'image'
      let next: PoseFrame | null = null
      let detectStatus: PoseDetectStatus = 'miss'
      if (suppressPoseRef.current) {
        bitmap.close()
        next = null
      } else if (synthetic) {
        bitmap.close()
        const fixture = syntheticPoseFrame(timestampMs)
        next = { ...fixture, videoWidth, videoHeight, timestampMs }
        detectStatus = 'frame'
      } else {
        const inferenceTs = fileClock ? performance.now() : timestampMs
        const workingW = bitmap.width
        const workingH = bitmap.height
        const detected = await engineRef.current.detectVideo(bitmap, inferenceTs)
        detectStatus = detected.status
        next = detected.status === 'frame' && detected.frame.landmarks.length > 0 ? detected.frame : null
        if (next) {
          if (!identity) {
            next = {
              ...next,
              landmarks: remapLandmarksToOriginal(
                next.landmarks,
                workingW,
                workingH,
                videoWidth,
                videoHeight,
                transform,
              ),
            }
          }
          next = { ...next, timestampMs, videoWidth, videoHeight }
        }
      }

      if (next) {
        if (!next.nearSide) {
          next.nearSide = inferNearSide(next.landmarks, MIN_LANDMARK_VISIBILITY)
        }
        if (next.nearSide) nearSideRef.current = next.nearSide
        runtimeFailsRef.current = applyDetectToRuntimeFails(runtimeFailsRef.current, 'frame')
        setPoseFrame(next)
        setPoseSeenAt(poseReceiveTime())
        setInferenceMs(next.inferenceMs ?? null)
      } else {
        const last = poseSeenAtRef.current
        const receivedAt = poseReceiveTime()
        const hold = poseHoldForSource({
          source: sourceRef.current,
          paused: video.paused || video.ended,
          staticCheck: fileKindRef.current === 'image',
        })
        if (hold !== 'static' && last !== null && receivedAt - last >= POSE_LOST_MS) {
          setPoseFrame(null)
        }
        if (!synthetic) {
          runtimeFailsRef.current = applyDetectToRuntimeFails(runtimeFailsRef.current, detectStatus)
          if (shouldMarkWorkerTimeout(runtimeFailsRef.current)) {
            setWorkerStatus('error')
            setWorkerError('Pose-Erkennung antwortet nicht (Timeout). Erneut versuchen.')
          }
        }
      }

      const receivedNow = poseReceiveTime()
      const liveFresh = poseFreshness(next ? receivedNow : poseSeenAtRef.current, receivedNow, {
        hold: poseHoldForSource({
          source: sourceRef.current,
          paused: video.paused || video.ended,
          staticCheck: fileKindRef.current === 'image',
        }),
      })
      const overlayFrame = liveFresh.status === 'lost' ? null : next
      let drawFrame = overlayFrame
      if (!overlayFrame || liveFresh.status === 'lost') {
        overlayFilterRef.current.reset()
        overlayStatusRef.current = EMPTY_OVERLAY_FILTER_STATUS
      } else if (overlayFilterOnRef.current) {
        const filtered = overlayFilterRef.current.apply(overlayFrame)
        overlayStatusRef.current = filtered
        drawFrame = filtered.frame
      } else {
        overlayFilterRef.current.reset()
        overlayStatusRef.current = EMPTY_OVERLAY_FILTER_STATUS
      }
      const measure = measureSideLockRef.current.apply(overlayFrame)
      measureSideStatusRef.current = measure
      if (measure.lockedSide) nearSideRef.current = measure.lockedSide
      drawIstOverlay(ctx, drawFrame, calibrationRef.current, calibrationRef.current.transform, sample)
      drawFootOverlay(ctx, drawFrame, sample)
      if (overlayFilterOnRef.current && drawFrame) {
        ctx.fillStyle = 'rgba(240, 195, 106, 0.92)'
        ctx.font = '11px "IBM Plex Mono", monospace'
        const note = overlayStatusRef.current.needsNewTake
          ? '1€ overlay · Seite wechseln = neue Aufnahme'
          : '1€ overlay (Labor, nicht für Metriken)'
        ctx.fillText(note, 16, overlay.height - 16)
      }
      const detectNow = detectRef.current
      if (detectNow.phase === 'review' || detectNow.phase === 'applied') {
        drawProposal(ctx, detectNow)
      }

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
      if (!identity) drawSourceTransform(ctx, videoWidth, videoHeight, transform)

      if (sample && !staticCheck) {
        const rawPose = poseForMetrics(overlayFrame, drawFrame)
        const lockedPose = measure.pose ?? rawPose
        const frame = {
          timestampMs,
          pose: lockedPose,
          pedal: sample,
          transform: calibrationRef.current.transform,
        }
        if (measure.lockedSide) {
          metricsRef.current.push(frame)
        }
        let recordingSnap: MeasurementSnapshot | null = null
        if (captureRef.current.getState() === 'recording' && measure.lockedSide) {
          const angle = pedalAngleDeg(sample)
          let image = null
          if (scratch && phaseCaptureRef.current.shouldEncode(angle) && angle !== null) {
            const phaseId = nearestPhaseId(angle)
            if (phaseId) {
              image = encodePhaseStill({
                source: scratch,
                sourceWidth: scratch.width,
                sourceHeight: scratch.height,
                pose: lockedPose,
                calibration: calibrationRef.current,
                pedal: sample,
                phaseId,
                crankAngleDeg: angle,
                side: measure.lockedSide,
                timestampMs,
                frameKneeDeg: null,
              })
            }
          }
          phaseCaptureRef.current.push(frame, image)
          footCollectorRef.current.push(lockedPose, sample)
          if (footCollectorRef.current.size() % 10 === 0) {
            setFootDiagnostic(footCollectorRef.current.snapshot(planeScaleRef.current))
          }
          recordingSnap = captureRef.current.push(frame)
          const range = mediaRangeRef.current
          const start = range?.start ?? mediaTimeMs
          mediaRangeRef.current = { start, end: mediaTimeMs }
          if (recordingSnap.state === 'finished' || recordingSnap.frozen) {
            if (!phaseEvidenceRef.current) {
              phaseEvidenceRef.current = phaseCaptureRef.current.freeze({
                calibration: calibrationRef.current,
                side: nearSideRef.current,
                source:
                  sourceRef.current === 'synthetic'
                    ? 'synthetic'
                    : sourceRef.current === 'file'
                      ? 'file'
                      : 'camera',
                metricMethod: 'bottom_dead_center',
              })
            }
            setCaptureSnap(recordingSnap)
            setMediaRange(mediaRangeRef.current)
            setFootDiagnostic(footCollectorRef.current.snapshot(planeScaleRef.current))
          }
        }
        if (timestampMs - metricsSnapAt >= 200 || metricsSnapAt === 0) {
          metricsSnapAt = timestampMs
          setMetricsReport(metricsRef.current.snapshot())
          setCaptureSnap(recordingSnap ?? captureRef.current.snapshot())
        }
        if (timestampMs - overlaySnapAt >= 200 || overlaySnapAt === 0) {
          overlaySnapAt = timestampMs
          setMeasureSideStatus(measureSideStatusRef.current)
          if (overlayFilterOnRef.current) {
            setOverlayFilterStatus(overlayStatusRef.current)
            const rawDeg = kneeDegFromPose(overlayFrame, calibrationRef.current.transform)
            const filteredDeg = kneeDegFromPose(drawFrame, calibrationRef.current.transform)
            setOverlayCompare({
              rawDeg,
              filteredDeg,
              deltaDeg: rawDeg !== null && filteredDeg !== null ? filteredDeg - rawDeg : null,
            })
          }
        }
      }
    },
      {
        timestampClock: fileClock ? 'media' : 'wall',
        maxGapMs: SEEK_RESET_GAP_MS,
        onDiscontinuity: (info) => {
          applyFileTransportSeek(
            camera.status.source,
            info,
            {
              resetPedalTemporal: () => trackerRef.current.resetTemporal(),
              resetMetrics: () => {
                metricsRef.current.reset()
                setMetricsReport(emptyMetricsReport())
              },
              resetCaptureAggregators: resetTimeDependentSegment,
              bumpPoseSession: () => {
                engineRef.current.bumpSession()
              },
              resetOverlayFilter: () => overlayFilterRef.current.reset(),
              resetPose: () => {
                setPoseFrame(null)
                setPoseSeenAt(null)
              },
            },
          )
        },
      },
    )

    return () => {
      loop.stop()
    }
  }, [camera.file?.kind, camera.file?.objectUrl, camera.status.source, camera.stream, overlayElement, playback.playable, resetTimeDependentSegment, stageMounted, videoElement])

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
          provenance: { ...prev.provenance, [id]: manualProvenance(id) },
          detect: prev.detect
            ? { ...prev.detect, gripContact: id === 'G' ? 'hand' : prev.detect.gripContact }
            : prev.detect,
          imageGeneration: detectRef.current.imageGeneration || imageGenerationRef.current || prev.imageGeneration || 0,
        }
      })
      if (id === 'G') {
        setDetect((prev) => (prev.gripContact === 'hand' ? prev : { ...prev, gripContact: 'hand' }))
      }
    },
    [currentBinding],
  )

  const seedAt = useCallback((point: PixelPoint) => {
    trackerRef.current.seed(point.x, point.y)
    seededRef.current = true
    userSeededRef.current = true
    setSeedPoint(point)
  }, [])

  const commitDetect = useCallback(
    (session: DetectSession) => {
      setDetect(session)
      const result = applyConfirmed(session, currentBinding(), calibrationRef.current)
      if (result.calibration) setCalibration(result.calibration)
    },
    [currentBinding],
  )

  const cancelRecognize = useCallback(() => {
    detectRunRef.current += 1
    detectEngineRef.current.cancel()
    setDetect(cancelDetectRun(detectBeforeRunRef.current))
  }, [])

  const recognizeBike = useCallback(() => {
    const capState = captureRef.current.getState()
    if (capState === 'recording' || capState === 'countdown' || detectRef.current.locked) return
    const video = videoRef.current
    const still = stillRef.current
    if (!video || !still) {
      setDetect(failToManual('Kein Videobild. Punkte manuell setzen — nichts blockiert.'))
      return
    }
    const captured = captureStillFrame(video, still)
    setFrozen(true)
    if (!captured) {
      setDetect(failToManual('Standbild fehlgeschlagen. Manuell kalibrieren.'))
      return
    }
    const pixels = readStillPixels(still)
    if (!pixels) {
      setDetect(failToManual('Standbild ohne Pixel. Manuell kalibrieren.'))
      return
    }
    setStillImage(pixels)
    const riderPresent = Boolean(poseFrame && poseFrame.landmarks.length > 0)
    const source =
      sourceRef.current === 'camera' || sourceRef.current === 'synthetic' || sourceRef.current === 'file'
        ? sourceRef.current
        : 'unknown'
    const generation = ++imageGenerationRef.current
    const runId = ++detectRunRef.current
    detectBeforeRunRef.current = detectRef.current.phase === 'running' ? detectBeforeRunRef.current : detectRef.current
    setDetect(beginDetectRun({ imageGeneration: generation, source }))
    void detectEngineRef.current
      .detect(pixels, {
        generation,
        riderPresent,
        source,
        onProgress: (progress, message) => {
          if (runId !== detectRunRef.current) return
          setDetect((prev) => (prev.phase === 'running' ? updateDetectProgress(prev, progress, message) : prev))
        },
      })
      .then((result) => {
        if (runId !== detectRunRef.current) return
        if (detectRef.current.locked) return
        if (result.status === 'cancelled') {
          setDetect(cancelDetectRun(detectBeforeRunRef.current))
          return
        }
        if (result.status === 'error') {
          setDetect(failToManual(`${result.message} Manuell kalibrieren — nichts blockiert.`, generation))
          return
        }
        setDetect(
          sessionFromDetect(result.output, {
            previous: detectBeforeRunRef.current,
            imageGeneration: generation,
          }),
        )
      })
  }, [poseFrame])

  const confirmPoints = useCallback(() => {
    if (detectRef.current.locked) return
    commitDetect(confirmProposal(detectRef.current))
  }, [commitDetect])

  const selectBike = useCallback((id: string) => {
    setDetect(selectCandidate(detectRef.current, id))
  }, [])

  const fallbackToManual = useCallback(() => {
    setDetect(fallbackManual(detectRef.current))
  }, [])

  const applyDetectCorrection = useCallback(
    (id: BikeMarkId, point: PixelPoint) => {
      if (detectRef.current.locked) return
      const next = correctPoint(detectRef.current, id, point)
      if (next.phase === 'applied') commitDetect(next)
      else setDetect(next)
    },
    [commitDetect],
  )

  const confirmGrip = useCallback(
    (kind: GripKind) => {
      const live = detectRef.current
      if (selectedPoints(live)) {
        commitDetect(confirmGripContact(live, kind))
        return
      }
      // Restore path: DetectSession is idle, persisted calibration is source of truth.
      setDetect((prev) => ({ ...prev, gripContact: kind }))
      setCalibration((prev) => confirmGripOnCalibration(prev, kind))
    },
    [commitDetect],
  )

  const placeScalePoint = useCallback((target: ScalePlaceTarget, point: PixelPoint) => {
    const key =
      target === 'refA' ? 'a' : target === 'refB' ? 'b' : target === 'checkA' ? 'checkA' : 'checkB'
    setScaleDraft((prev) => ({ ...prev, [key]: point }))
    setScalePlacing((prev) => {
      if (prev === 'refA') return 'refB'
      if (prev === 'checkA') return 'checkB'
      return null
    })
    setScaleMessage(null)
  }, [])

  const storeScaleDraft = useCallback(() => {
    const draft = scaleDraftRef.current
    const measured = Number(draft.measuredValue.replace(',', '.'))
    const uncertainty = Number(draft.uncertainty.replace(',', '.') || '0')
    if (!draft.a || !draft.b) {
      setScaleMessage('Zwei Bezugspunkte in der Bildebene setzen.')
      return
    }
    const ref = draftReference({
      purpose: draft.purpose,
      a: draft.a,
      b: draft.b,
      measuredValue: measured,
      unit: draft.unit,
      perspective: draft.perspective,
      uncertainty: { value: Number.isFinite(uncertainty) ? uncertainty : 0, source: 'user' },
    })
    if (!ref.ok) {
      setScaleMessage(ref.reason)
      return
    }
    const next = storeDraftScale(ref.value)
    setPlaneScale(saveStoredScale(next))
    setScaleMessage(null)
  }, [])

  const runScaleCheck = useCallback(() => {
    const draft = scaleDraftRef.current
    const measured = Number(draft.measuredValue.replace(',', '.'))
    const uncertainty = Number(draft.uncertainty.replace(',', '.') || '0')
    const known = Number(draft.checkValue.replace(',', '.'))
    if (!draft.a || !draft.b) {
      setScaleMessage('Zwei Bezugspunkte in der Bildebene setzen.')
      return
    }
    if (!draft.checkA || !draft.checkB) {
      setScaleMessage('Unabhängige Prüfpunkte (zweite bekannte Länge) setzen.')
      return
    }
    const ref = draftReference({
      purpose: draft.purpose,
      a: draft.a,
      b: draft.b,
      measuredValue: measured,
      unit: draft.unit,
      perspective: draft.perspective,
      uncertainty: { value: Number.isFinite(uncertainty) ? uncertainty : 0, source: 'user' },
    })
    if (!ref.ok) {
      setScaleMessage(ref.reason)
      return
    }
    const checked = runIndependentCheck(ref.value, { a: draft.checkA, b: draft.checkB }, known, draft.checkUnit)
    if (!checked.ok) {
      setScaleMessage(checked.reason)
      return
    }
    const next = commitCheckedScale(ref.value, checked.value)
    setPlaneScale(saveStoredScale(next))
    setScaleMessage(null)
    setScalePlacing(null)
  }, [])

  const clearScale = useCallback(() => {
    const next = emptyPlaneScale()
    setPlaneScale(saveStoredScale(next))
    setScaleDraft(EMPTY_SCALE_DRAFT)
    setScalePlacing(null)
    setScaleMessage(null)
  }, [])

  const onStageClick = useCallback(
    (clientX: number, clientY: number) => {
      const video = videoRef.current
      if (!video) return
      const point = clientToVideoPixel(video, clientX, clientY)
      if (!point) return
      if (scalePlacingRef.current) {
        placeScalePoint(scalePlacingRef.current, point)
        return
      }
      if (stageClickMode === 'pedal' || pedalSelecting) {
        seedAt(point)
        return
      }
      if (stageClickMode === 'off') return
      const reviewing = detect.phase === 'review' || detect.phase === 'applied'
      if (reviewing && !detect.locked) {
        applyDetectCorrection(activeMark, point)
        return
      }
      placeMark(activeMark, point)
      if (activeMark === 'B') setActiveMark('S')
      else if (activeMark === 'S') setActiveMark('G')
    },
    [activeMark, applyDetectCorrection, detect.locked, detect.phase, pedalSelecting, placeMark, placeScalePoint, seedAt, stageClickMode],
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
  const staticCheck = fileStaticCheck || camera.file?.kind === 'image' || !cycleMeasurementAllowed(camera.file?.kind)

  const playReplay = useCallback(() => {
    if (camera.file?.kind === 'image') return
    const video = videoRef.current
    if (video) void playFile(video)
  }, [camera.file?.kind])

  const pauseReplay = useCallback(() => {
    if (camera.file?.kind === 'image') return
    const video = videoRef.current
    if (video) pauseFile(video)
  }, [camera.file?.kind])

  const seekReplay = useCallback((timeSec: number) => {
    if (camera.file?.kind === 'image') return
    const video = videoRef.current
    if (video) seekFile(video, timeSec)
  }, [camera.file?.kind])

  const stepReplay = useCallback((direction: -1 | 1) => {
    if (camera.file?.kind === 'image') return
    const video = videoRef.current
    if (video) stepFileFrame(video, direction)
  }, [camera.file?.kind])

  const restartReplay = useCallback(() => {
    if (camera.file?.kind === 'image') return
    const video = videoRef.current
    applySeekReset(
      {
        resetPedalTemporal: () => trackerRef.current.resetTemporal(),
        resetMetrics: () => {
          metricsRef.current.reset()
          setMetricsReport(emptyMetricsReport())
        },
        resetCaptureAggregators: resetTimeDependentSegment,
        bumpPoseSession: () => engineRef.current.bumpSession(),
        resetOverlayFilter: () => overlayFilterRef.current.reset(),
        resetPose: () => {
          setPoseFrame(null)
          setPoseSeenAt(null)
        },
      },
      1,
      0,
    )
    mediaRangeRef.current = null
    setMediaRange(null)
    if (video) restartFile(video)
  }, [camera.file?.kind, resetTimeDependentSegment])

  const rotateSource = useCallback(() => {
    setSourceTransform((prev) => ({ ...prev, rotation: nextRotation(prev.rotation) }))
  }, [])

  const setCrop = useCallback((crop: SourceTransform['crop']) => {
    setSourceTransform((prev) => ({ ...prev, crop }))
  }, [])

  const value = useMemo<FitSession>(
    () => ({
      camera: {
        status: camera.status,
        stream: camera.stream,
        start: camera.start,
        stop: camera.stop,
        restart,
        startSynthetic: camera.startSynthetic,
        file: camera.file,
        startFile: camera.startFile,
        replay: presentFilePlayback(fileReplay, camera.status.source === 'file' && staticCheck),
        transform: sourceTransform,
        rotate: rotateSource,
        setCrop,
        play: playReplay,
        pause: pauseReplay,
        seek: seekReplay,
        stepFrame: stepReplay,
        restartReplay,
        staticCheck: camera.status.source === 'file' && staticCheck,
        mediaRange,
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
        model: 'lite',
        overlayFilter: {
          enabled: overlayFilterOn,
          setEnabled: setOverlayFilterEnabled,
          needsNewTake: overlayFilterStatus.needsNewTake,
          occludedNearSide: overlayFilterStatus.occludedNearSide,
          lockedSide: overlayFilterStatus.lockedSide,
          compare: overlayCompare,
        },
        measureSide: {
          lockedSide: measureSideStatus.lockedSide,
          needsNewTake: measureSideStatus.needsNewTake,
          occludedLockedSide: measureSideStatus.occludedLockedSide,
        },
      },
      calibration: {
        data: calibration,
        activeMark,
        setActiveMark,
        placeMark,
        clearMarks: () => {
          detectRunRef.current += 1
          detectEngineRef.current.cancel()
          setCalibration(emptyCalibration(currentBinding()))
          setDetect(emptyDetectSession())
          setStillImage(null)
        },
        applyFixtureMarks: () => {
          if (!allowFixture) return
          const marks = { B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G }
          setCalibration((prev) => ({
            ...prev,
            marks,
            transform: computePixelBikeTransform(marks),
            updatedAt: new Date().toISOString(),
            binding: currentBinding() ?? prev.binding ?? null,
            provenance: {
              B: manualProvenance('B'),
              S: manualProvenance('S'),
              G: manualProvenance('G'),
            },
            detect: {
              version: { detector: 'fixture.v1', model: null },
              riderPresent: true,
              gripContact: 'hand',
            },
            imageGeneration: detectRef.current.imageGeneration || imageGenerationRef.current || 0,
          }))
        },
        save: () => setCalibration((prev) => saveCalibration(prev)),
        load: () => {
          const loaded = loadCalibration()
          if (!loaded) return
          setCalibration(loaded)
          setDetect((prev) => restoreDetectGrip(prev, loaded))
        },
        knee,
        frozen,
        toggleFreeze,
        clearFreeze,
        allowFixture,
        assessment,
        detect,
        stillImage,
        recognizeBike,
        cancelRecognize,
        confirmPoints,
        selectBike,
        fallbackManual: fallbackToManual,
        correctDetectPoint: applyDetectCorrection,
        confirmGrip,
      },
      scale: {
        data: planeScale,
        draft: scaleDraft,
        placing: scalePlacing,
        message: scaleMessage,
        setDraft: (patch) => setScaleDraft((prev) => ({ ...prev, ...patch })),
        setPlacing: setScalePlacing,
        storeDraft: storeScaleDraft,
        runCheck: runScaleCheck,
        clear: clearScale,
      },
      foot: {
        diagnostic: footDiagnostic,
        takeSnapshot: (scale) => {
          const next = footCollectorRef.current.snapshot(scale ?? planeScaleRef.current)
          setFootDiagnostic(next)
          return next
        },
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
          const capState = captureRef.current.getState()
          if (capState === 'recording' || capState === 'countdown') {
            phaseCaptureRef.current.reset()
            phaseEvidenceRef.current = null
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
          if (camera.status.source === 'file' && camera.file?.kind === 'image') return
          phaseCaptureRef.current.reset()
          phaseEvidenceRef.current = null
          footCollectorRef.current.reset()
          setFootDiagnostic(emptyFootDiagnostic())
          measureSideLockRef.current.reset()
          measureSideStatusRef.current = EMPTY_MEASURE_SIDE_STATUS
          setMeasureSideStatus(EMPTY_MEASURE_SIDE_STATUS)
          setCaptureSnap(captureRef.current.startCountdown(nowMs, seconds))
        },
        tickCapture: (nowMs) => {
          setCaptureSnap(captureRef.current.tick(nowMs))
        },
        beginRecording: () => {
          phaseCaptureRef.current.reset()
          phaseEvidenceRef.current = null
          footCollectorRef.current.reset()
          setFootDiagnostic(emptyFootDiagnostic())
          measureSideLockRef.current.reset()
          measureSideStatusRef.current = EMPTY_MEASURE_SIDE_STATUS
          setMeasureSideStatus(EMPTY_MEASURE_SIDE_STATUS)
          mediaRangeRef.current = {
            start: videoRef.current ? videoRef.current.currentTime * 1000 : 0,
            end: videoRef.current ? videoRef.current.currentTime * 1000 : 0,
          }
          setMediaRange(mediaRangeRef.current)
          setCaptureSnap(captureRef.current.beginRecording())
        },
        finishRecording: () => {
          const snap = captureRef.current.finish()
          if (!phaseEvidenceRef.current) {
            phaseEvidenceRef.current = phaseCaptureRef.current.freeze({
              calibration: calibrationRef.current,
              side: nearSideRef.current,
              source:
                sourceRef.current === 'synthetic'
                  ? 'synthetic'
                  : sourceRef.current === 'file'
                    ? 'file'
                    : 'camera',
              metricMethod: 'bottom_dead_center',
            })
          }
          const foot = footCollectorRef.current.snapshot(planeScaleRef.current)
          setFootDiagnostic(foot)
          setCaptureSnap(snap)
          return snap
        },
        abortRecording: (reason) => {
          phaseCaptureRef.current.reset()
          phaseEvidenceRef.current = null
          footCollectorRef.current.reset()
          setFootDiagnostic(emptyFootDiagnostic())
          setCaptureSnap(captureRef.current.abort(reason))
        },
        resetCapture: () => {
          phaseCaptureRef.current.reset()
          phaseEvidenceRef.current = null
          footCollectorRef.current.reset()
          setFootDiagnostic(emptyFootDiagnostic())
          setCaptureSnap(captureRef.current.reset())
        },
        takePhaseEvidence: () => phaseEvidenceRef.current,
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
      confirmGrip,
      confirmPoints,
      currentBinding,
      detect,
      applyDetectCorrection,
      fallbackToManual,
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
      recognizeBike,
      cancelRecognize,
      selectBike,
      stillImage,
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
      fileReplay,
      sourceTransform,
      rotateSource,
      setCrop,
      playReplay,
      pauseReplay,
      seekReplay,
      stepReplay,
      restartReplay,
      staticCheck,
      mediaRange,
      overlayFilterOn,
      overlayFilterStatus,
      overlayCompare,
      measureSideStatus,
      setOverlayFilterEnabled,
      planeScale,
      scaleDraft,
      scalePlacing,
      scaleMessage,
      storeScaleDraft,
      runScaleCheck,
      clearScale,
      footDiagnostic,
    ],
  )

  return <FitContext.Provider value={value}>{children}</FitContext.Provider>
}
