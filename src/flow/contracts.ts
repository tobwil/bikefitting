import type { BikeCalibration } from '../types/calibration.ts'
import type { PedalSample } from '../types/pedal.ts'
import type { PoseFrame } from '../types/landmarks.ts'
import type { MetricsReport } from '../types/metrics.ts'
import type { OverlayGhost } from '../shell/drawGhost.ts'
import type {
  AdapterSource,
  MetricCardModel,
  QualityReport,
  Recommendation,
  SavedSession,
} from './types.ts'

export type LiveMetricInput = {
  pose: PoseFrame | null
  kneeDegrees: number | null
  kneeVisible: boolean
  pedal: PedalSample
  calibration: BikeCalibration
  report?: MetricsReport | null
}

export type SessionsApi = {
  source: AdapterSource
  list: () => Promise<SavedSession[]>
  get: (id: string) => Promise<SavedSession | null>
  save: (session: SavedSession) => Promise<SavedSession>
  remove: (id: string) => Promise<void>
}

export type MetricsApi = {
  source: AdapterSource
  liveCards: (input: LiveMetricInput) => MetricCardModel[]
  quality: (input: {
    cards: MetricCardModel[]
    validRevs: number
    targetRevs: number
    lostFrames: number
    productionEnabled: boolean
  }) => QualityReport
}

export type RulesApi = {
  source: AdapterSource
  recommend: (input: {
    cards: MetricCardModel[]
    quality: QualityReport
    productionEnabled: boolean
  }) => Recommendation[]
}

export type SollApi = {
  source: AdapterSource
  ghost: (input: {
    pose: PoseFrame | null
    calibration: BikeCalibration
    pedal: PedalSample
    videoSize: { width: number; height: number }
  }) => OverlayGhost | null
}

export type AdapterBundle = {
  sessions: SessionsApi
  metrics: MetricsApi
  rules: RulesApi
  soll: SollApi
}
