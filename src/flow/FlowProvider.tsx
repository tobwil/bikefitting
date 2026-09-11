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
  TARGET_VALID_REVS,
  type FlowStepId,
} from './constants.ts'
import type { AdapterBundle } from './contracts.ts'
import { stubMetrics } from './stubs/metrics.ts'
import { stubRules } from './stubs/rules.ts'
import { stubSessions } from './stubs/sessions.ts'
import { stubSoll } from './stubs/soll.ts'
import { ampelAllowed, profileFromLocation } from './profile.ts'
import type {
  BodyCheck,
  FitProfile,
  MeasurePhase,
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
    quality: QualityReport | null
    cards: MetricCardModel[]
    recommendations: Recommendation[]
    session: SavedSession | null
  }
  sessions: SavedSession[]
  refreshSessions: () => Promise<void>
  startNew: () => void
  openSaved: (id: string) => Promise<void>
  saveCurrent: () => Promise<SavedSession | null>
  removeSaved: (id: string) => Promise<void>
  exportCurrent: () => void
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
  sessions: stubSessions,
  metrics: stubMetrics,
  rules: stubRules,
  soll: stubSoll,
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
  const [resultQuality, setResultQuality] = useState<QualityReport | null>(null)
  const [resultCards, setResultCards] = useState<MetricCardModel[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [session, setSession] = useState<SavedSession | null>(null)
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const lastRevRef = useRef(0)
  const lostMaxRef = useRef(0)
  const pedalRef = useRef(fit.pedal.sample)

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
    const rows = await adapters.sessions.list()
    setSessions(rows)
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
      }),
    [
      adapters.metrics,
      fit.pose.frame,
      fit.calibration.knee.degrees,
      fit.calibration.knee.visible,
      fit.pedal.sample,
      fit.calibration.data,
    ],
  )

  useEffect(() => {
    if (phase !== 'running') return
    lostMaxRef.current = Math.max(lostMaxRef.current, fit.pedal.sample.lostFrames)
    const revs = fit.pedal.sample.revolutions
    const locked = fit.pedal.sample.status === 'locked'
    if (locked && revs > lastRevRef.current) {
      const gained = revs - lastRevRef.current
      lastRevRef.current = revs
      setValidRevs((n) => Math.min(TARGET_VALID_REVS, n + gained))
    }
  }, [fit.pedal.sample, phase])

  useEffect(() => {
    if (phase === 'running' && validRevs >= TARGET_VALID_REVS) {
      setPhase('complete')
    }
  }, [phase, validRevs])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      lastRevRef.current = pedalRef.current.revolutions
      lostMaxRef.current = pedalRef.current.lostFrames
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
    lastRevRef.current = 0
    lostMaxRef.current = 0
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
      const cards = liveCards
      const revs = opts?.demo && validRevs === 0 ? Math.min(3, TARGET_VALID_REVS) : validRevs
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
      setValidRevs(revs)
      setResultCards(cards)
      setResultQuality(quality)
      setRecommendations(recs)
      setPhase('complete')
      setStep('result')
    },
    [adapters.metrics, adapters.rules, ampel, liveCards, validRevs],
  )

  const startNew = useCallback(() => {
    setSession(null)
    setResultQuality(null)
    setResultCards([])
    setRecommendations([])
    resetMeasure()
    setStep('camera')
  }, [resetMeasure])

  const openSaved = useCallback(
    async (id: string) => {
      const row = await adapters.sessions.get(id)
      if (!row) return
      setSession(row)
      setResultCards(row.metrics)
      setResultQuality(row.quality)
      setRecommendations(row.recommendations)
      setValidRevs(row.validRevs)
      setPhase('complete')
      setStep('result')
    },
    [adapters.sessions],
  )

  const saveCurrent = useCallback(async () => {
    if (!resultQuality) return null
    const now = new Date().toISOString()
    const row: SavedSession = {
      id: session?.id ?? crypto.randomUUID(),
      title: `Messung ${new Date().toLocaleString('de-DE')}`,
      createdAt: session?.createdAt ?? now,
      updatedAt: now,
      profile,
      quality: resultQuality,
      metrics: resultCards,
      recommendations,
      validRevs,
      targetRevs: TARGET_VALID_REVS,
      calibration: fit.calibration.data,
      adapters: {
        sessions: adapters.sessions.source,
        metrics: adapters.metrics.source,
        rules: adapters.rules.source,
        soll: adapters.soll.source,
      },
    }
    const saved = await adapters.sessions.save(row)
    setSession(saved)
    await refreshSessions()
    return saved
  }, [
    adapters,
    fit.calibration.data,
    profile,
    recommendations,
    refreshSessions,
    resultCards,
    resultQuality,
    session,
    validRevs,
  ])

  const removeSaved = useCallback(
    async (id: string) => {
      await adapters.sessions.remove(id)
      if (session?.id === id) setSession(null)
      await refreshSessions()
    },
    [adapters.sessions, refreshSessions, session?.id],
  )

  const exportCurrent = useCallback(() => {
    if (!resultQuality) return
    const payload = {
      exportedAt: new Date().toISOString(),
      localOnly: true,
      upload: false,
      profile,
      quality: resultQuality,
      metrics: resultCards,
      recommendations,
      validRevs,
      targetRevs: TARGET_VALID_REVS,
      calibration: fit.calibration.data,
      adapters: {
        sessions: adapters.sessions.source,
        metrics: adapters.metrics.source,
        rules: adapters.rules.source,
        soll: adapters.soll.source,
      },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bikefit-messung-${(session?.id ?? 'lokal').slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [
    adapters,
    fit.calibration.data,
    profile,
    recommendations,
    resultCards,
    resultQuality,
    session?.id,
    validRevs,
  ])

  const remeasure = useCallback(() => {
    setSession(null)
    setResultQuality(null)
    setResultCards([])
    setRecommendations([])
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
        quality: resultQuality,
        cards: resultCards,
        recommendations,
        session,
      },
      sessions,
      refreshSessions,
      startNew,
      openSaved,
      saveCurrent,
      removeSaved,
      exportCurrent,
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
      exportCurrent,
      finish,
      goTo,
      liveCards,
      mode,
      next,
      openSaved,
      phase,
      profile,
      recommendations,
      refreshSessions,
      remeasure,
      removeSaved,
      resetMeasure,
      resultCards,
      resultQuality,
      saveCurrent,
      session,
      sessions,
      startCountdown,
      startNew,
      step,
      validRevs,
    ],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}
