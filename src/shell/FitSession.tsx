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
import { useCamera } from '../camera/useCamera.ts'
import { SYNTHETIC_MARKS } from '../camera/synthetic.ts'
import { measureKneeAngle } from '../calibration/kneeAngle.ts'
import { emptyCalibration, loadCalibration, saveCalibration } from '../calibration/storage.ts'
import { computePixelBikeTransform } from '../calibration/transform.ts'
import { createPedalTracker, findMagentaMarker } from '../pedal/tracker.ts'
import { runTenRevolutionHarness } from '../pedal/harness.ts'
import type { PedalHarnessResult } from '../pedal/harness.ts'
import {
  createMetricsPipeline,
  emptyMetricsReport,
  runMetricsHarness,
} from '../metrics/index.ts'
import type { MetricsHarnessResult } from '../metrics/index.ts'
import type { MetricsReport } from '../types/metrics.ts'
import { createPoseEngine } from '../pose/createPoseEngine.ts'
import { drawIstOverlay, landmarkToPixel } from '../pose/drawIst.ts'
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
import type { BikeCalibration, BikeMarkId, KneeAngleReading, PixelPoint } from '../types/calibration.ts'
import type { CameraStatus } from '../types/camera.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { BodyModel, SollSolveResult, SollUiState } from '../types/soll.ts'
import { drawGhostOverlay, type OverlayGhost } from './drawGhost.ts'
import { clientToVideoPixel, sizeOverlayToVideo } from './videoCoords.ts'

export type WorkerStatus = 'idle' | 'loading' | 'WORKER_READY' | 'error'

export type FitSession = {
  camera: {
    status: CameraStatus
    stream: MediaStream | null
    start: (deviceId?: string) => Promise<void>
    stop: () => void
    restart: () => Promise<void>
    startSynthetic: () => void
    allowSynthetic: boolean
  }
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  pose: {
    workerStatus: WorkerStatus
    workerError: string | null
    frame: PoseFrame | null
    inferenceMs: number | null
    nearSide: string
    frameSync: 'rvfc' | 'raf' | 'idle'
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
  }
  pedal: {
    sample: PedalSample
    harness: PedalHarnessResult | null
    runHarness: () => void
    seedAt: (point: PixelPoint) => void
    reset: () => void
  }
  metrics: {
    report: MetricsReport
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
  const engineRef = useRef(createPoseEngine())
  const trackerRef = useRef(createPedalTracker())
  const metricsRef = useRef(createMetricsPipeline({ minVisibility: MIN_LANDMARK_VISIBILITY }))
  const scratchRef = useRef<HTMLCanvasElement | null>(null)

  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>('idle')
  const [workerError, setWorkerError] = useState<string | null>(null)
  const [poseFrame, setPoseFrame] = useState<PoseFrame | null>(null)
  const [inferenceMs, setInferenceMs] = useState<number | null>(null)
  const [frameSync, setFrameSync] = useState<FitSession['pose']['frameSync']>('idle')
  const [calibration, setCalibration] = useState<BikeCalibration>(() => loadCalibration() ?? emptyCalibration())
  const [activeMark, setActiveMark] = useState<BikeMarkId>('B')
  const [pedalSample, setPedalSample] = useState<PedalSample>({
    timestampMs: 0,
    pixel: null,
    crankAngleDeg: null,
    phase01: null,
    revolutions: 0,
    status: 'idle',
    lostFrames: 0,
  })
  const [harness, setHarness] = useState<PedalHarnessResult | null>(null)
  const [stageClickEnabled, setStageClickEnabled] = useState(true)
  const [stageMounted, setStageMounted] = useState(false)
  const [metricsReport, setMetricsReport] = useState<MetricsReport>(() => emptyMetricsReport())
  const [metricsHarness, setMetricsHarness] = useState<MetricsHarnessResult | null>(null)
  const [sollUi, setSollUi] = useState<SollUiState>(DEFAULT_SOLL_UI)
  const [sollResult, setSollResult] = useState<SollSolveResult>(emptySollResult)
  const [measuredBody, setMeasuredBody] = useState<BodyModel | null>(null)
  const [sollHarness, setSollHarness] = useState<SollHarnessResult | null>(null)
  const sollBody = measuredBody ?? estimateBodyModel(calibration)
  const calibrationRef = useRef(calibration)
  const sourceRef = useRef(camera.status.source)
  const seededRef = useRef(false)
  const ghostOverlayRef = useRef<OverlayGhost | null>(null)
  const sollUiRef = useRef(sollUi)
  const sollBodyRef = useRef(sollBody)

  useEffect(() => {
    calibrationRef.current = calibration
    trackerRef.current.setBottomBracket(calibration.marks.B)
  }, [calibration])

  useEffect(() => {
    sollUiRef.current = sollUi
  }, [sollUi])

  useEffect(() => {
    sollBodyRef.current = sollBody
  }, [sollBody])

  useEffect(() => {
    sourceRef.current = camera.status.source
    if (camera.status.source === 'synthetic' && camera.status.permission === 'granted') {
      const marks = { B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G }
      setCalibration((prev) => ({
        ...prev,
        marks,
        transform: computePixelBikeTransform(marks),
        updatedAt: new Date().toISOString(),
      }))
    }
  }, [camera.status.source, camera.status.permission])

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
    const video = videoRef.current
    if (!video) return
    video.srcObject = camera.stream
    if (camera.stream) {
      void video.play().catch(() => {
        /* autoplay can fail until a click — Start already is a click */
      })
    }
    return () => {
      video.srcObject = null
    }
  }, [camera.stream])

  useEffect(() => {
    let cancelled = false
    const engine = createPoseEngine()
    engineRef.current = engine
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
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!stageMounted || !video || !overlay || !camera.stream) {
      setFrameSync('idle')
      return
    }

    seededRef.current = false
    trackerRef.current.reset()
    trackerRef.current.setBottomBracket(calibrationRef.current.marks.B)
    metricsRef.current.reset()
    setMetricsReport(emptyMetricsReport())
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
        if (!seededRef.current) {
          const found = findMagentaMarker(imageData)
          if (found) {
            trackerRef.current.seed(found.x, found.y)
            seededRef.current = true
          }
        }
        sample = trackerRef.current.update(imageData, timestampMs)
        setPedalSample(sample)
      }

      const synthetic = sourceRef.current === 'synthetic'
      let next: PoseFrame | null = null
      if (synthetic) {
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
        setPoseFrame(next)
        setInferenceMs(next.inferenceMs ?? null)
      }

      drawIstOverlay(ctx, next, calibrationRef.current, calibrationRef.current.transform, sample)

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

      if (sample) {
        metricsRef.current.push({
          timestampMs,
          pose: next,
          pedal: sample,
          transform: calibrationRef.current.transform,
        })
        if (timestampMs - metricsSnapAt >= 200 || metricsSnapAt === 0) {
          metricsSnapAt = timestampMs
          setMetricsReport(metricsRef.current.snapshot())
        }
      }
    })

    return () => {
      loop.stop()
    }
  }, [camera.stream, stageMounted])

  const placeMark = useCallback((id: BikeMarkId, point: PixelPoint) => {
    setCalibration((prev) => {
      const marks = { ...prev.marks, [id]: point }
      return {
        ...prev,
        marks,
        transform: computePixelBikeTransform(marks),
        updatedAt: new Date().toISOString(),
      }
    })
  }, [])

  const onStageClick = useCallback(
    (clientX: number, clientY: number) => {
      const video = videoRef.current
      if (!video) return
      const point = clientToVideoPixel(video, clientX, clientY)
      if (!point) return
      placeMark(activeMark, point)
      if (activeMark === 'B') setActiveMark('S')
      else if (activeMark === 'S') setActiveMark('G')
    },
    [activeMark, placeMark],
  )

  const knee = useMemo<KneeAngleReading>(() => {
    const frame = poseFrame
    if (!frame) return { definition: 'flexion', degrees: null, visible: false }
    const near = frame.nearSide ?? inferNearSide(frame.landmarks, MIN_LANDMARK_VISIBILITY) ?? 'right'
    const hip = visibleJoint(frame.landmarks, near, 'HIP', MIN_LANDMARK_VISIBILITY)
    const kneeLm = visibleJoint(frame.landmarks, near, 'KNEE', MIN_LANDMARK_VISIBILITY)
    const ankle = visibleJoint(frame.landmarks, near, 'ANKLE', MIN_LANDMARK_VISIBILITY)
    const toPx = (lm: { x: number; y: number } | null) =>
      lm ? landmarkToPixel(lm, frame.videoWidth, frame.videoHeight) : null
    return measureKneeAngle(toPx(hip), toPx(kneeLm), toPx(ankle), 'flexion')
  }, [poseFrame])

  const setGhostOverlay = useCallback((ghost: OverlayGhost | null) => {
    ghostOverlayRef.current = ghost
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
        allowSynthetic: ALLOW_SYNTHETIC_FIXTURE,
      },
      videoRef,
      overlayRef,
      pose: {
        workerStatus,
        workerError,
        frame: poseFrame,
        inferenceMs,
        nearSide: poseFrame?.nearSide ?? '—',
        frameSync,
      },
      calibration: {
        data: calibration,
        activeMark,
        setActiveMark,
        placeMark,
        clearMarks: () => setCalibration(emptyCalibration()),
        applyFixtureMarks: () => {
          const marks = { B: SYNTHETIC_MARKS.B, S: SYNTHETIC_MARKS.S, G: SYNTHETIC_MARKS.G }
          setCalibration((prev) => ({
            ...prev,
            marks,
            transform: computePixelBikeTransform(marks),
            updatedAt: new Date().toISOString(),
          }))
        },
        save: () => setCalibration((prev) => saveCalibration(prev)),
        load: () => {
          const loaded = loadCalibration()
          if (loaded) setCalibration(loaded)
        },
        knee,
      },
      pedal: {
        sample: pedalSample,
        harness,
        runHarness: () => setHarness(runTenRevolutionHarness()),
        seedAt: (point) => {
          trackerRef.current.seed(point.x, point.y)
          seededRef.current = true
        },
        reset: () => {
          trackerRef.current.reset()
          trackerRef.current.setBottomBracket(calibration.marks.B)
          seededRef.current = false
          setPedalSample({
            timestampMs: 0,
            pixel: null,
            crankAngleDeg: null,
            phase01: null,
            revolutions: 0,
            status: 'idle',
            lostFrames: 0,
          })
          metricsRef.current.reset()
          setMetricsReport(emptyMetricsReport())
        },
      },
      metrics: {
        report: metricsReport,
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
          if (!poseFrame) return
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
      setStageMounted,
    }),
    [
      activeMark,
      calibration,
      camera,
      frameSync,
      harness,
      inferenceMs,
      knee,
      metricsHarness,
      metricsReport,
      onStageClick,
      pedalSample,
      placeMark,
      poseFrame,
      restart,
      setGhostOverlay,
      sollBody,
      sollHarness,
      sollResult,
      sollUi,
      stageClickEnabled,
      workerError,
      workerStatus,
    ],
  )

  return <FitContext.Provider value={value}>{children}</FitContext.Provider>
}
