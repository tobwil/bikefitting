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
import { loadAdapters } from './adapters.ts'
import { bodyChecks } from './bodyChecks.ts'
import {
  COUNTDOWN_SECONDS,
  FLOW_STEPS,
  MIN_DEMO_REVS,
  TARGET_VALID_REVS,
  type FlowStepId,
} from './constants.ts'
import type { AdapterBundle } from './contracts.ts'
import { realMetrics } from './bindMetrics.ts'
import { realRules } from './bindRules.ts'
import { realSessions } from './bindSessions.ts'
import { realSoll } from './bindSoll.ts'
import { consumeFrozenReport, storageWriteMessage } from './buildResult.ts'
import { freezeOnComplete, restoreOpenSaved, snapshotForExport, snapshotForResave } from './resultSnapshot.ts'
import { resultToJson, resultToMarkdown } from './exportResult.ts'
import { frozenResultSource } from '../types/result.ts'
import { filterLengthAdvice } from '../scale/advice.ts'
import { stripPhaseImages } from '../metrics/phaseFrames.ts'
import { decideActionFromFlow } from './bindRules.ts'
import { evidenceIdsFromPhase } from '../action/evidence.ts'
import { recommendationsFromAction } from '../action/recommendations.ts'
import { ampelAllowed, profileFromLocation } from './profile.ts'
import { downloadText } from '../sessions/download.ts'
import { playCountdownCue } from './audioCues.ts'
import { flowCalibrateReady } from './calibrateReady.ts'
import {
  remeasureDestination,
  shouldAbortCaptureOnLeave,
  shouldAutoCommitResult,
} from './navPolicy.ts'
import type { MeasurementSnapshot } from '../metrics/index.ts'
import type {
  BodyCheck,
  FitProfile,
  JourneyKind,
  MeasurePhase,
  MeasurementResult,
  MetricCardModel,
  QualityReport,
  Recommendation,
  SavedSession,
} from './types.ts'

export type AppMode = 'flow' | 'lab'

export type FlowContextValue = {
  mode: AppMode
  setMode: (mode: AppMode) => void
  step: FlowStepId
  goTo: (step: FlowStepId) => void
  next: () => void
  back: () => void
  journey: JourneyKind
  profile: FitProfile
  ampel: boolean
  adapters: AdapterBundle
  adaptersReady: boolean
  body: BodyCheck[]
  bodyReady: boolean
  cameraReady: boolean
  calibrateReady: boolean
  measure: {
    phase: MeasurePhase
    countdown: number
    validRevs: number
    targetRevs: number
    cards: MetricCardModel[]
    startCountdown: () => void
    abort: () => void
    finish: (opts?: { demo?: boolean }) => void
    reset: () => void
    measurementId: string | null
  }
  result: {
    dataset: MeasurementResult | null
    quality: QualityReport | null
    cards: MetricCardModel[]
    recommendations: Recommendation[]
    session: SavedSession | null
  }
  sessions: SavedSession[]
  storageError: string | null
  refreshSessions: () => Promise<void>
  startNew: () => void
  startDemo: () => void
  startFromFile: (file: File) => void
  openSaved: (id: string) => Promise<void>
  saveCurrent: () => Promise<SavedSession | null>
  removeSaved: (id: string) => Promise<void>
  exportCurrent: () => void
  exportCurrentMarkdown: () => void
  deletePhaseImages: () => Promise<void>
  remeasure: () => void
}

const FlowContext = createContext<FlowContextValue | null>(null)

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow must be used inside FlowProvider')
  return ctx
}

export function useOptionalFlow(): FlowContextValue | null {
  return useContext(FlowContext)
}

const FALLBACK_ADAPTERS: AdapterBundle = {
  sessions: realSessions,
  metrics: realMetrics,
  rules: realRules,
  soll: realSoll,
}

function stepIndex(id: FlowStepId) {
  return FLOW_STEPS.indexOf(id)
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const fit = useFit()
  const [mode, setMode] = useState<AppMode>('flow')
  const [step, setStep] = useState<FlowStepId>('start')
  const [journey, setJourney] = useState<JourneyKind>('camera')
  const [profile] = useState<FitProfile>(() => profileFromLocation())
  const [adapters, setAdapters] = useState<AdapterBundle>(FALLBACK_ADAPTERS)
  const [adaptersReady, setAdaptersReady] = useState(false)
  const [dataset, setDataset] = useState<MeasurementResult | null>(null)
  const [session, setSession] = useState<SavedSession | null>(null)
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [storageError, setStorageError] = useState<string | null>(null)
  const committedIdRef = useRef<string | null>(null)
  const ignoredResultIdsRef = useRef(new Set<string>())
  const demoWaitRef = useRef(false)
  const measureStartedAtRef = useRef<string | null>(null)
  const capture = fit.metrics.capture
  const phase = capture.state
  const countdown = capture.countdownDisplay
  const validRevs =
    phase === 'recording' || phase === 'finished' ? capture.report.validRevolutions : 0

  const ampel = ampelAllowed(profile)

  useEffect(() => {
    let cancelled = false
    void loadAdapters().then((bundle) => {
      if (!cancelled) {
        setAdapters(bundle)
        setAdaptersReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const rows = await adapters.sessions.list()
      setSessions(rows)
      const alignErrors =
        'alignErrors' in adapters.sessions
          ? (adapters.sessions as { alignErrors?: string[] }).alignErrors
          : undefined
      if (alignErrors && alignErrors.length > 0) {
        setStorageError(alignErrors[0] ?? null)
      }
    } catch (err) {
      setStorageError(storageWriteMessage(err))
    }
  }, [adapters.sessions])

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  const setStageClickMode = fit.setStageClickMode
  const setStageClickEnabled = fit.setStageClickEnabled
  const setPedalSelecting = fit.pedal.setSelecting
  const pedalSelecting = fit.pedal.selecting
  const stopCamera = fit.camera.stop

  useEffect(() => {
    if (mode === 'lab') {
      setStageClickMode(pedalSelecting ? 'pedal' : 'calibrate')
      setStageClickEnabled(true)
      return
    }
    if (step === 'calibrate') {
      setStageClickMode('calibrate')
      setStageClickEnabled(true)
      setPedalSelecting(false)
    } else if (step === 'body') {
      setStageClickMode('pedal')
      setStageClickEnabled(true)
      setPedalSelecting(true)
    } else {
      setStageClickMode('off')
      setStageClickEnabled(false)
      setPedalSelecting(false)
    }
  }, [
    mode,
    pedalSelecting,
    setPedalSelecting,
    setStageClickEnabled,
    setStageClickMode,
    step,
  ])

  useEffect(() => {
    if (mode === 'flow' && step === 'start') {
      stopCamera()
    }
  }, [mode, step, stopCamera])

  useEffect(() => {
    const showSoll = mode === 'flow' && (step === 'measure' || step === 'body' || step === 'result')
    if (!showSoll) {
      fit.setGhostOverlay(null)
      return
    }
    const video = fit.videoRef.current
    // Single flow-level ghost compute for this pose/pedal/calibration tick.
    fit.setGhostOverlay(
      adapters.soll.ghost({
        pose: fit.pose.frame,
        calibration: fit.calibration.data,
        pedal: fit.pedal.sample,
        videoSize: {
          width: video?.videoWidth ?? fit.pose.frame?.videoWidth ?? 0,
          height: video?.videoHeight ?? fit.pose.frame?.videoHeight ?? 0,
        },
      }),
    )
  }, [
    adapters.soll,
    fit.calibration.data,
    fit.pedal.sample,
    fit.pose.frame,
    fit.setGhostOverlay,
    fit.videoRef,
    mode,
    step,
  ])

  useEffect(() => {
    if (phase === 'recording' && !measureStartedAtRef.current) {
      measureStartedAtRef.current = new Date().toISOString()
    }
  }, [phase])

  const playable =
    fit.camera.status.permission === 'granted' &&
    (Boolean(fit.camera.stream) || fit.camera.status.source === 'file') &&
    fit.camera.playback.playable &&
    !fit.camera.playback.playError
  const cameraReady =
    playable &&
    (journey === 'demo' ||
      journey === 'file' ||
      fit.camera.status.source === 'camera' ||
      fit.camera.status.source === 'file' ||
      fit.camera.allowSynthetic)
  const calibrateReady = flowCalibrateReady(fit)
  const body = useMemo(() => bodyChecks(fit), [fit])
  const bodyReady = body.every((check) => check.ok)

  const liveCards = useMemo(
    () =>
      adapters.metrics.liveCards({
        pose: fit.pose.frame,
        kneeDegrees: fit.calibration.knee.degrees,
        kneeVisible: fit.calibration.knee.visible,
        pedal: fit.pedal.sample,
        calibration: fit.calibration.data,
        report: capture.report,
      }),
    [
      adapters.metrics,
      fit.pose.frame,
      fit.calibration.knee.degrees,
      fit.calibration.knee.visible,
      fit.pedal.sample,
      fit.calibration.data,
      capture.report,
    ],
  )

  const prevPhaseRef = useRef(phase)
  useEffect(() => {
    if (prevPhaseRef.current === 'countdown' && phase === 'recording') {
      playCountdownCue('end')
    }
    prevPhaseRef.current = phase
  }, [phase])

  const ignoreCaptureResult = useCallback((id: string | null) => {
    if (id) ignoredResultIdsRef.current.add(id)
  }, [])

  /** New recording only — keeps pedal lock / user seed. */
  const resetRecording = useCallback(() => {
    demoWaitRef.current = false
    committedIdRef.current = null
    measureStartedAtRef.current = null
    fit.metrics.resetCapture()
  }, [fit.metrics])

  const abortActiveCapture = useCallback(
    (reason = 'aborted') => {
      const snap = fit.metrics.capture
      if (!shouldAbortCaptureOnLeave(snap.state)) return false
      ignoreCaptureResult(snap.id)
      demoWaitRef.current = false
      measureStartedAtRef.current = null
      fit.metrics.abortRecording(reason)
      fit.metrics.resetCapture()
      return true
    },
    [fit.metrics, ignoreCaptureResult],
  )

  const goTo = useCallback(
    (nextStep: FlowStepId) => {
      const aborted = abortActiveCapture('aborted')
      if (aborted && nextStep === 'result') return
      setStep(nextStep)
    },
    [abortActiveCapture],
  )

  const next = useCallback(() => {
    const i = stepIndex(step)
    const upcoming = FLOW_STEPS[i + 1]
    if (!upcoming) return
    goTo(upcoming)
  }, [goTo, step])

  const back = useCallback(() => {
    const i = stepIndex(step)
    const prev = FLOW_STEPS[i - 1]
    if (!prev) return
    goTo(prev)
  }, [goTo, step])

  const setAppMode = useCallback(
    (nextMode: AppMode) => {
      if (nextMode === 'lab') abortActiveCapture('aborted')
      setMode(nextMode)
    },
    [abortActiveCapture],
  )

  const resetTracker = useCallback(() => {
    fit.pedal.reset()
  }, [fit.pedal])

  const resetMeasure = useCallback(() => {
    resetRecording()
    resetTracker()
  }, [resetRecording, resetTracker])

  const startCountdown = useCallback(() => {
    if (fit.camera.staticCheck) return
    demoWaitRef.current = false
    committedIdRef.current = null
    measureStartedAtRef.current = null
    setDataset(null)
    setSession(null)
    playCountdownCue('start')
    fit.metrics.startCountdown(COUNTDOWN_SECONDS, performance.now())
  }, [fit.camera.staticCheck, fit.metrics])

  const abortMeasure = useCallback(() => {
    const snap = fit.metrics.capture
    ignoreCaptureResult(snap.id)
    demoWaitRef.current = false
    committedIdRef.current = null
    measureStartedAtRef.current = null
    if (shouldAbortCaptureOnLeave(snap.state)) {
      fit.metrics.abortRecording('aborted')
    }
    fit.metrics.resetCapture()
  }, [fit.metrics, ignoreCaptureResult])

  const commitSnapshot = useCallback(
    (snap: MeasurementSnapshot, opts?: { demo?: boolean }) => {
      const report = consumeFrozenReport({
        report: snap.report,
        frozen: snap.frozen ? snap.report : null,
      })
      const cards = adapters.metrics.liveCards({
        pose: fit.pose.frame,
        kneeDegrees: fit.calibration.knee.degrees,
        kneeVisible: fit.calibration.knee.visible,
        pedal: fit.pedal.sample,
        calibration: fit.calibration.data,
        report,
      })
      const revs = report.validRevolutions
      const quality = adapters.metrics.quality({
        cards,
        validRevs: revs,
        targetRevs: TARGET_VALID_REVS,
        lostFrames: report.tracking.lostFrames,
        productionEnabled: ampel,
        report,
        measurementId: snap.id,
      })
      const endedAt = new Date().toISOString()
      const startedAt = measureStartedAtRef.current ?? endedAt
      const captureKind =
        fit.camera.status.source === 'synthetic'
          ? 'synthetic'
          : fit.camera.status.source === 'file'
            ? 'file'
            : 'camera'
      const evaluation = opts?.demo ? 'demo' : 'standard'
      const taken = fit.metrics.takePhaseEvidence()
      const phaseEvidence = taken
        ? { ...taken, source: frozenResultSource(captureKind, evaluation) }
        : null
      const action = decideActionFromFlow({
        cards,
        quality,
        productionEnabled: ampel,
        report,
        captureId: snap.id,
        analysisId: snap.id,
        evidenceIds: evidenceIdsFromPhase(phaseEvidence, snap.id),
        audience: 'beginner',
      })
      const recs = filterLengthAdvice(recommendationsFromAction(action), fit.scale.data)
      const nextDataset = freezeOnComplete({
        startedAt,
        endedAt,
        capture: captureKind,
        evaluation,
        profile,
        calibration: fit.calibration.data,
        metrics: cards,
        quality,
        recommendations: recs,
        actionDecision: action,
        validRevs: revs,
        targetRevs: TARGET_VALID_REVS,
        adapters: {
          sessions: adapters.sessions.source,
          metrics: adapters.metrics.source,
          rules: adapters.rules.source,
          soll: adapters.soll.source,
        },
        file:
          fit.camera.status.source === 'file' && fit.camera.file
            ? {
                kind: fit.camera.file.kind,
                name: fit.camera.file.name,
                mimeType: fit.camera.file.mimeType,
                width: fit.camera.playback.width || fit.camera.file.width,
                height: fit.camera.playback.height || fit.camera.file.height,
                durationMs: fit.camera.file.durationMs,
                mediaTimeRangeMs: {
                  start: fit.camera.mediaRange?.start ?? 0,
                  end: fit.camera.mediaRange?.end ?? fit.camera.replay.currentTimeMs,
                },
                staticCheck: fit.camera.staticCheck,
                rotationDeg: fit.camera.transform.rotation,
                crop: fit.camera.transform.crop,
                upload: false,
              }
            : undefined,
        mediaStartMs: fit.camera.mediaRange?.start,
        mediaEndMs: fit.camera.mediaRange?.end,
        phaseEvidence,
        scale: fit.scale.data,
        foot: fit.foot.takeSnapshot(fit.scale.data),
      })
      demoWaitRef.current = false
      committedIdRef.current = snap.id
      setDataset(nextDataset)
      setSession(null)
      setStep('result')
    },
    [adapters, ampel, fit.calibration.data, fit.calibration.knee, fit.camera, fit.foot, fit.metrics, fit.pedal.sample, fit.pose.frame, fit.scale.data, profile],
  )

  const finish = useCallback(
    (opts?: { demo?: boolean }) => {
      const snap = fit.metrics.capture
      const reportRevs = snap.report.validRevolutions
      const cards = liveCards
      const hasNumber = cards.some((c) => c.value != null && Number.isFinite(c.value))
      if (opts?.demo && snap.state !== 'recording' && snap.state !== 'finished') {
        demoWaitRef.current = true
        if (!measureStartedAtRef.current) measureStartedAtRef.current = new Date().toISOString()
        fit.metrics.beginRecording()
        return
      }
      if (opts?.demo && snap.state === 'recording' && (!hasNumber || reportRevs < MIN_DEMO_REVS)) {
        demoWaitRef.current = true
        return
      }
      const frozen = snap.state === 'finished' ? snap : fit.metrics.finishRecording()
      commitSnapshot(frozen, opts)
    },
    [commitSnapshot, fit.metrics, liveCards],
  )

  useEffect(() => {
    if (
      !shouldAutoCommitResult({
        phase,
        captureId: capture.id,
        committedId: committedIdRef.current,
        ignoredIds: ignoredResultIdsRef.current,
      })
    ) {
      return
    }
    commitSnapshot(capture, { demo: demoWaitRef.current })
  }, [capture, commitSnapshot, phase])

  const calibFrozen = fit.calibration.frozen
  const clearFreeze = fit.calibration.clearFreeze
  useEffect(() => {
    if (mode === 'lab') return
    if (step === 'calibrate') return
    if (calibFrozen) clearFreeze()
  }, [calibFrozen, clearFreeze, mode, step])

  useEffect(() => {
    if (!demoWaitRef.current || phase !== 'recording') return
    const hasNumber = liveCards.some((c) => c.value != null && Number.isFinite(c.value))
    if (hasNumber && validRevs >= MIN_DEMO_REVS) {
      finish({ demo: true })
    }
  }, [finish, liveCards, phase, validRevs])

  useEffect(() => {
    if (!demoWaitRef.current || phase !== 'recording') return
    const timer = window.setTimeout(() => {
      if (!demoWaitRef.current) return
      finish({ demo: true })
    }, 20000)
    return () => window.clearTimeout(timer)
  }, [finish, phase])

  const startNew = useCallback(() => {
    setJourney('camera')
    setSession(null)
    setDataset(null)
    setStorageError(null)
    resetMeasure()
    fit.camera.stop()
    setStep('camera')
  }, [fit.camera, resetMeasure])

  const startDemo = useCallback(() => {
    setJourney('demo')
    setSession(null)
    setDataset(null)
    setStorageError(null)
    resetMeasure()
    fit.camera.startSynthetic()
    setStep('camera')
  }, [fit.camera, resetMeasure])

  const startFromFile = useCallback(
    (file: File) => {
      setJourney('file')
      setSession(null)
      setDataset(null)
      setStorageError(null)
      resetMeasure()
      void fit.camera.startFile(file)
      setStep('camera')
    },
    [fit.camera, resetMeasure],
  )

  const openSaved = useCallback(
    async (id: string) => {
      try {
        const row = await adapters.sessions.get(id)
        if (!row) return
        const restored = restoreOpenSaved(row)
        setSession(row)
        setDataset(restored.result)
        setJourney(restored.journey)
        setStorageError(null)
        committedIdRef.current = restored.result.id
        setStep('result')
      } catch (err) {
        setStorageError(storageWriteMessage(err))
      }
    },
    [adapters.sessions],
  )

  const saveCurrent = useCallback(async () => {
    if (!dataset) return null
    const now = new Date().toISOString()
    const row = snapshotForResave(dataset, {
      id: session?.id ?? dataset.id,
      title: session?.title ?? `Messung ${new Date().toLocaleString('de-DE')}`,
      createdAt: session?.createdAt ?? dataset.createdAt,
      updatedAt: now,
    })
    try {
      const saved = await adapters.sessions.save(row)
      setSession(saved)
      setDataset(saved.result)
      setStorageError(null)
      await refreshSessions()
      return saved
    } catch (err) {
      setStorageError(storageWriteMessage(err))
      return null
    }
  }, [adapters.sessions, dataset, refreshSessions, session])

  const removeSaved = useCallback(
    async (id: string) => {
      try {
        await adapters.sessions.remove(id)
        if (session?.id === id) {
          setSession(null)
          setDataset(null)
        }
        setStorageError(null)
        await refreshSessions()
      } catch (err) {
        setStorageError(storageWriteMessage(err))
      }
    },
    [adapters.sessions, refreshSessions, session?.id],
  )

  const deletePhaseImages = useCallback(async () => {
    if (!dataset?.phaseEvidence) return
    const next = { ...dataset, phaseEvidence: stripPhaseImages(dataset.phaseEvidence) }
    setDataset(next)
    if (!session) return
    const row = snapshotForResave(next, {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
    })
    try {
      const saved = await adapters.sessions.save(row)
      setSession(saved)
      setDataset(saved.result)
      setStorageError(null)
      await refreshSessions()
    } catch (err) {
      setStorageError(storageWriteMessage(err))
    }
  }, [adapters.sessions, dataset, refreshSessions, session])

  const exportPayload = useCallback(() => {
    if (!dataset) return null
    return snapshotForExport(dataset)
  }, [dataset])

  const exportCurrent = useCallback(() => {
    const payload = exportPayload()
    if (!payload) return
    const tag = payload.demo ? 'demo' : 'messung'
    downloadText(
      `bikefit-${tag}-${(session?.id ?? dataset?.id ?? 'lokal').slice(0, 8)}.json`,
      resultToJson(payload),
      'application/json',
    )
  }, [dataset?.id, exportPayload, session?.id])

  const exportCurrentMarkdown = useCallback(() => {
    const payload = exportPayload()
    if (!payload) return
    const tag = payload.demo ? 'demo' : 'messung'
    downloadText(
      `bikefit-${tag}-${(session?.id ?? dataset?.id ?? 'lokal').slice(0, 8)}.md`,
      resultToMarkdown(payload),
      'text/markdown',
    )
  }, [dataset?.id, exportPayload, session?.id])

  const remeasure = useCallback(() => {
    setSession(null)
    setDataset(null)
    setStorageError(null)
    const dest = remeasureDestination({
      cameraReady,
      calibrateReady,
      sample: fit.pedal.sample,
      seedPoint: fit.pedal.seedPoint,
    })
    resetRecording()
    setStep(dest)
  }, [calibrateReady, cameraReady, fit.pedal.sample, fit.pedal.seedPoint, resetRecording])

  const value = useMemo<FlowContextValue>(
    () => ({
      mode,
      setMode: setAppMode,
      step,
      goTo,
      next,
      back,
      journey,
      profile,
      ampel,
      adapters,
      adaptersReady,
      body,
      bodyReady,
      cameraReady,
      calibrateReady,
      measure: {
        phase,
        countdown,
        validRevs,
        targetRevs: TARGET_VALID_REVS,
        cards: liveCards,
        startCountdown,
        abort: abortMeasure,
        finish,
        reset: resetRecording,
        measurementId: capture.id,
      },
      result: {
        dataset,
        quality: dataset?.quality ?? null,
        cards: dataset?.metrics ?? [],
        recommendations: dataset?.recommendations ?? [],
        session,
      },
      sessions,
      storageError,
      refreshSessions,
      startNew,
      startDemo,
      startFromFile,
      openSaved,
      saveCurrent,
      removeSaved,
      exportCurrent,
      exportCurrentMarkdown,
      deletePhaseImages,
      remeasure,
    }),
    [
      abortMeasure,
      adapters,
      adaptersReady,
      ampel,
      back,
      body,
      bodyReady,
      calibrateReady,
      cameraReady,
      capture.id,
      countdown,
      dataset,
      deletePhaseImages,
      exportCurrent,
      exportCurrentMarkdown,
      finish,
      goTo,
      journey,
      liveCards,
      mode,
      next,
      openSaved,
      phase,
      profile,
      refreshSessions,
      remeasure,
      removeSaved,
      resetRecording,
      saveCurrent,
      setAppMode,
      session,
      sessions,
      startCountdown,
      startDemo,
      startFromFile,
      startNew,
      step,
      storageError,
      validRevs,
    ],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}
