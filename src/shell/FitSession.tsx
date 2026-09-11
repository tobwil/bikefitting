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
import { createPoseEngine } from '../pose/createPoseEngine.ts'
import { drawIstOverlay, landmarkToPixel } from '../pose/drawIst.ts'
import { startVideoFrameLoop } from '../pose/frameSync.ts'
import { inferNearSide, visibleJoint } from '../pose/nearSide.ts'
import { syntheticPoseFrame } from '../pose/syntheticLandmarks.ts'
import type { BikeCalibration, BikeMarkId, KneeAngleReading, PixelPoint } from '../types/calibration.ts'
import type { CameraStatus } from '../types/camera.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
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
  onStageClick: (clientX: number, clientY: number) => void
  ghostOverlayRef: React.MutableRefObject<OverlayGhost | null>
  setGhostOverlay: (ghost: OverlayGhost | null) => void
  stageClickEnabled: boolean
  setStageClickEnabled: (enabled: boolean) => void
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
  const calibrationRef = useRef(calibration)
  const sourceRef = useRef(camera.status.source)
  const seededRef = useRef(false)
  const ghostOverlayRef = useRef<OverlayGhost | null>(null)

  useEffect(() => {
    calibrationRef.current = calibration
    trackerRef.current.setBottomBracket(calibration.marks.B)
  }, [calibration])

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
    if (!video || !overlay || !camera.stream) {
      setFrameSync('idle')
      return
    }

    seededRef.current = false
    trackerRef.current.reset()
    trackerRef.current.setBottomBracket(calibrationRef.current.marks.B)
    setFrameSync(typeof video.requestVideoFrameCallback === 'function' ? 'rvfc' : 'raf')

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

      const detected = await engineRef.current.detectVideo(bitmap, timestampMs)
      const fixture =
        sourceRef.current === 'synthetic' ? syntheticPoseFrame(timestampMs) : null
      const next =
        detected && detected.landmarks.length > 0
          ? detected
          : fixture
            ? { ...fixture, videoWidth, videoHeight, timestampMs }
            : null
      if (next) {
        if (!next.nearSide) {
          next.nearSide = inferNearSide(next.landmarks, MIN_LANDMARK_VISIBILITY)
        }
        setPoseFrame(next)
        setInferenceMs(next.inferenceMs ?? null)
      }

      drawIstOverlay(ctx, next, calibrationRef.current, calibrationRef.current.transform, sample)
      const ghost = ghostOverlayRef.current
      if (ghost) drawGhostOverlay(ctx, ghost)
    })

    return () => {
      loop.stop()
    }
  }, [camera.stream])

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
        },
      },
      onStageClick,
      ghostOverlayRef,
      setGhostOverlay,
      stageClickEnabled,
      setStageClickEnabled,
    }),
    [
      activeMark,
      calibration,
      camera,
      frameSync,
      harness,
      inferenceMs,
      knee,
      onStageClick,
      pedalSample,
      placeMark,
      poseFrame,
      restart,
      setGhostOverlay,
      stageClickEnabled,
      workerError,
      workerStatus,
    ],
  )

  return <FitContext.Provider value={value}>{children}</FitContext.Provider>
}
