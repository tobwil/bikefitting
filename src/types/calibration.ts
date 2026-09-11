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
  source: 'camera' | 'synthetic'
  deviceId: string | null
  width: number
  height: number
  setupId: string
}

export type BikeCalibration = {
  version: number
  marks: Record<BikeMarkId, PixelPoint | null>
  transform: PixelBikeTransform | null
  createdAt: string
  updatedAt: string
  /** Optional so PR1 metrics/rules fixtures stay valid without a live camera. */
  binding?: CalibrationBinding | null
}

export const CALIBRATION_STORAGE_KEY = 'bikefit.calibration.v1'
export const CALIBRATION_SCHEMA_VERSION = 1

export type KneeAngleDefinition = 'inner' | 'flexion'

export type KneeAngleReading = {
  definition: KneeAngleDefinition
  degrees: number | null
  visible: boolean
}
