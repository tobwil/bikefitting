export type BikeMarkId = 'B' | 'S' | 'G'

export type PixelPoint = {
  x: number
  y: number
}

export type BikePoint = {
  x: number
  y: number
}

export type BikeFacing = 1 | -1

export type PixelBikeTransform = {
  originPx: PixelPoint
  forwardPx: PixelPoint
  upPx: PixelPoint
  facing: BikeFacing
  pixelsPerMm: number | null
}

export type CalibrationBinding = {
  source: 'camera' | 'synthetic' | 'file'
  deviceId: string | null
  width: number
  height: number
  setupId: string
}

export type PointStatus = 'proposed' | 'confirmed' | 'corrected' | 'undetermined'

export type PointOrigin = 'auto' | 'manual' | 'corrected'

export type GripKind = 'bike_ref' | 'hand'

export type DetectViewQuality = 'ok' | 'bad_perspective' | 'occluded' | 'ambiguous' | 'multiple' | 'none'

export const BIKE_DETECT_DETECTOR = 'geometry.v1'

export type BikeDetectVersion = {
  detector: string
  model: string | null
}

export type MarkProvenance = {
  origin: PointOrigin
  status: PointStatus
  visibility: number
  confidence: number
  occluded: boolean
  uncertain: boolean
  /** G only: hoods on the bike vs confirmed hand contact. */
  gripKind?: GripKind
}

export type BikeDetectMeta = {
  version: BikeDetectVersion
  riderPresent: boolean
  gripContact: 'unconfirmed' | GripKind
}

export type BikeCalibration = {
  version: number
  marks: Record<BikeMarkId, PixelPoint | null>
  transform: PixelBikeTransform | null
  createdAt: string
  updatedAt: string
  /** Optional so PR1 metrics/rules fixtures stay valid without a live camera. */
  binding?: CalibrationBinding | null
  /** Detector/model used for auto proposals. Absent on fully manual / legacy rows. */
  detect?: BikeDetectMeta | null
  /** Per-point origin. Only confirmed/corrected points belong in `marks`. */
  provenance?: Partial<Record<BikeMarkId, MarkProvenance>> | null
}

export const CALIBRATION_STORAGE_KEY = 'bikefit.calibration.v1'
export const CALIBRATION_SCHEMA_VERSION = 1

export type KneeAngleDefinition = 'inner' | 'flexion'

export type KneeAngleReading = {
  definition: KneeAngleDefinition
  degrees: number | null
  visible: boolean
}
