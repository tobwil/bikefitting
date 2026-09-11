import type { BikeCalibration } from '../types/calibration.ts'
import type { FlowStepId } from './constants.ts'

export type { FlowStepId }

export type AdapterSource = 'module' | 'stub' | 'mixed'

export type JourneyKind = 'camera' | 'demo'

export type FitProfile = {
  id: string
  name: string
  productionEnabled: boolean
}

export type MetricBand = 'in' | 'near' | 'out' | 'unknown'

export type MetricCardModel = {
  id: string
  label: string
  value: number | null
  unit: string
  band: MetricBand
  targetHint: string
  detail?: string
}

export type QualityLevel = 'ok' | 'borderline' | 'insufficient'

export type QualityReport = {
  level: QualityLevel
  label: string
  validRevs: number
  targetRevs: number
  lostFrames: number
  notes: string[]
}

export type Recommendation = {
  priority: number
  title: string
  reason: string
  metricId?: string
  deltaHint?: string
}

export type SavedSession = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  profile: FitProfile
  quality: QualityReport
  metrics: MetricCardModel[]
  recommendations: Recommendation[]
  validRevs: number
  targetRevs: number
  calibration: BikeCalibration
  adapters: Record<string, AdapterSource>
}

export type MeasurePhase = 'idle' | 'countdown' | 'running' | 'complete'

export type BodyCheck = {
  id: string
  label: string
  hint: string
  ok: boolean
}
