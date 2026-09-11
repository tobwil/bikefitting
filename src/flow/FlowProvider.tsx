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
import {
  buildMeasurementResult,
  consumeFrozenReport,
  savedFromResult,
  storageWriteMessage,
} from './buildResult.ts'
import { buildResultExport, resultToJson, resultToMarkdown } from './exportResult.ts'
import { ampelAllowed, profileFromLocation } from './profile.ts'
import { downloadText } from '../sessions/download.ts'
import type {
  BodyCheck,
  FitProfile,
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
    finish: (opts?: { demo?: boolean }) => void
    reset: () => void
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
  openSaved: (id: string) => Promise<void>
  saveCurrent: () => Promise<SavedSession | null>
  removeSaved: (id: string) => Promise<void>
  exportCurrent: () => void
  exportCurrentMarkdown: () => void
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
  const [profile] = useState<FitProfile>(() => profileFromLocation())
  const [adapters, setAdapters] = useState<AdapterBundle>(FALLBACK_ADAPTERS)
  const [adaptersReady, setAdaptersReady] = useState(false)
  const [phase, setPhase] = useState<MeasurePhase>('idle')
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [validRevs, setValidRevs] = useState(0)
  const [dataset, setDataset] = useState<MeasurementResult | null>(null)
  const [session, setSession] = useState<SavedSession | null>(null)
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [storageError, setStorageError] = useState<string | null>(null)
  const lostMaxRef = useRef(0)
  const pedalRef = useRef(fit.pedal.sample)
  const demoWaitRef = useRef(false)
  const measureStartedAtRef = useRef<string | null>(null)

  useEffect(() => {
    pedalRef.current = fit.pedal.sample
  }, [fit.pedal.sample])

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

  useEffect(() => {
    fit.setStageClickEnabled(mode === 'lab' || step === 'calibrate')
  }, [fit.setStageClickEnabled, mode, step])

  useEffect(() => {
    const showSoll = mode === 'flow' && (step === 'measure' || step === 'body' || step === 'result')
    if (!showSoll) {
      fit.setGhostOverlay(null)
      return
    }
    const video = fit.videoRef.current
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

  const cameraReady = fit.camera.status.permission === 'granted' && Boolean(fit.camera.stream)
  const calibrateReady = Boolean(
    fit.calibration.data.marks.B && fit.calibration.data.marks.S && fit.calibration.data.marks.G,
  )
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
        report: fit.metrics.report,
      }),
    [
      adapters.metrics,
      fit.pose.frame,
      fit.calibration.knee.degrees,
      fit.calibration.knee.visible,
      fit.pedal.sample,
      fit.calibration.data,
      fit.metrics.report,
    ],
  )

  useEffect(() => {
    if (phase !== 'running') return
    lostMaxRef.current = Math.max(lostMaxRef.current, fit.pedal.sample.lostFrames)
    setValidRevs(Math.min(TARGET_VALID_REVS, fit.metrics.report.validRevolutions))
  }, [fit.metrics.report.validRevolutions, fit.pedal.sample.lostFrames, phase])

  useEffect(() => {
    if (phase === 'running' && !measureStartedAtRef.current) {
      measureStartedAtRef.current = new Date().toISOString()
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      lostMaxRef.current = pedalRef.current.lostFrames
      if (!measureStartedAtRef.current) measureStartedAtRef.current = new Date().toISOString()
      setPhase('running')
      return
    }
    const timer = window.setTimeout(() => setCountdown((n) => n - 1), 800)
    return () => window.clearTimeout(timer)
  }, [countdown, phase])

  const goTo = useCallback((nextStep: FlowStepId) => {
    setStep(nextStep)
  }, [])

  const next = useCallback(() => {
    const i = stepIndex(step)
    const upcoming = FLOW_STEPS[i + 1]
    if (upcoming) setStep(upcoming)
  }, [step])

  const back = useCallback(() => {
    const i = stepIndex(step)
    const prev = FLOW_STEPS[i - 1]
    if (prev) setStep(prev)
  }, [step])

  const resetCounters = useCallback(() => {
    setPhase('idle')
    setCountdown(COUNTDOWN_SECONDS)
    setValidRevs(0)
    lostMaxRef.current = 0
    demoWaitRef.current = false
    measureStartedAtRef.current = null
  }, [])

  const resetMeasure = useCallback(() => {
    resetCounters()
    fit.pedal.reset()
  }, [fit.pedal, resetCounters])

  const startCountdown = useCallback(() => {
    resetCounters()
    setCountdown(COUNTDOWN_SECONDS)
    setPhase('countdown')
  }, [resetCounters])

  const finish = useCallback(
    (opts?: { demo?: boolean }) => {
      const frozenReport = consumeFrozenReport(fit.metrics)
      const cards = adapters.metrics.liveCards({
        pose: fit.pose.frame,
        kneeDegrees: fit.calibration.knee.degrees,
        kneeVisible: fit.calibration.knee.visible,
        pedal: fit.pedal.sample,
        calibration: fit.calibration.data,
        report: frozenReport,
      })
      const reportRevs = frozenReport.validRevolutions
      const hasNumber = cards.some((c) => c.value != null && Number.isFinite(c.value))
      if (opts?.demo && !demoWaitRef.current && (!hasNumber || reportRevs < MIN_DEMO_REVS)) {
        demoWaitRef.current = true
        lostMaxRef.current = pedalRef.current.lostFrames
        if (!measureStartedAtRef.current) measureStartedAtRef.current = new Date().toISOString()
        setPhase('running')
        return
      }
      const revs = opts?.demo ? Math.max(validRevs, reportRevs, hasNumber ? MIN_DEMO_REVS : 0) : validRevs
      const quality = adapters.metrics.quality({
        cards,
        validRevs: revs,
        targetRevs: TARGET_VALID_REVS,
        lostFrames: lostMaxRef.current,
        productionEnabled: ampel,
      })
      const recs = adapters.rules.recommend({
        cards,
        quality,
        productionEnabled: ampel,
      })
      const endedAt = new Date().toISOString()
      const startedAt = measureStartedAtRef.current ?? endedAt
      const next = buildMeasurementResult({
        startedAt,
        endedAt,
        capture: fit.camera.status.source === 'synthetic' ? 'synthetic' : 'camera',
        evaluation: opts?.demo ? 'demo' : 'standard',
        profile,
        calibration: fit.calibration.data,
        metrics: cards,
        quality,
        recommendations: recs,
        validRevs: revs,
        targetRevs: TARGET_VALID_REVS,
        adapters: {
          sessions: adapters.sessions.source,
          metrics: adapters.metrics.source,
          rules: adapters.rules.source,
          soll: adapters.soll.source,
        },
      })
      demoWaitRef.current = false
      setValidRevs(revs)
      setDataset(next)
      setSession(null)
      setPhase('complete')
      setStep('result')
    },
    [adapters, ampel, fit, profile, validRevs],
  )

  useEffect(() => {
    if (phase === 'running' && validRevs >= TARGET_VALID_REVS) {
      finish()
    }
  }, [finish, phase, validRevs])

  useEffect(() => {
    if (!demoWaitRef.current || phase !== 'running') return
    const hasNumber = liveCards.some((c) => c.value != null && Number.isFinite(c.value))
    if (hasNumber && validRevs >= MIN_DEMO_REVS) {
      finish({ demo: true })
    }
  }, [finish, liveCards, phase, validRevs])

  useEffect(() => {
    if (!demoWaitRef.current || phase !== 'running') return
    const timer = window.setTimeout(() => {
      if (!demoWaitRef.current) return
      finish({ demo: true })
    }, 20000)
    return () => window.clearTimeout(timer)
  }, [finish, phase])

  const startNew = useCallback(() => {
    setSession(null)
    setDataset(null)
    setStorageError(null)
    resetMeasure()
    setStep('camera')
  }, [resetMeasure])

  const openSaved = useCallback(
    async (id: string) => {
      try {
        const row = await adapters.sessions.get(id)
        if (!row) return
        setSession(row)
        setDataset(row.result)
        setValidRevs(row.result.validRevs)
        setStorageError(null)
        setPhase('complete')
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
    const row = savedFromResult(dataset, {
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

  const exportPayload = useCallback(() => {
    if (!dataset) return null
    return buildResultExport(dataset)
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
    resetMeasure()
    setStep('measure')
  }, [resetMeasure])

  const value = useMemo<FlowContextValue>(
    () => ({
      mode,
      setMode,
      step,
      goTo,
      next,
      back,
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
        finish,
        reset: resetMeasure,
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
      openSaved,
      saveCurrent,
      removeSaved,
      exportCurrent,
      exportCurrentMarkdown,
      remeasure,
    }),
    [
      adapters,
      adaptersReady,
      ampel,
      back,
      body,
      bodyReady,
      calibrateReady,
      cameraReady,
      countdown,
      dataset,
      exportCurrent,
      exportCurrentMarkdown,
      finish,
      goTo,
      liveCards,
      mode,
      next,
      openSaved,
      phase,
      profile,
      refreshSessions,
      remeasure,
      removeSaved,
      resetMeasure,
      saveCurrent,
      session,
      sessions,
      startCountdown,
      startNew,
      step,
      storageError,
      validRevs,
    ],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}
