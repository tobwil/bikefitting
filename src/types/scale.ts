import type { PixelPoint } from './calibration.ts'

/** On-disk / result shape. Bump when the payload changes. */
export const PLANE_SCALE_SCHEMA_VERSION = 1

export const SCALE_STORAGE_KEY = 'bikefit.scale.v1'

export const SCALE_UNITS = ['mm', 'cm', 'in'] as const
export type ScaleUnit = (typeof SCALE_UNITS)[number]

/** Relevant image plane for this product. Sagittal side view only. */
export const SCALE_PLANES = ['sagittal'] as const
export type ScalePlane = (typeof SCALE_PLANES)[number]

/**
 * What the user-measured pair is for.
 * Frame stack/reach need their own refs — existing S/G marks are not enough.
 */
export const SCALE_PURPOSES = ['length_in_plane', 'frame_stack', 'frame_reach'] as const
export type ScalePurpose = (typeof SCALE_PURPOSES)[number]

export const PERSPECTIVE_CONDITIONS = ['side_view_ok', 'oblique', 'unknown'] as const
export type PerspectiveCondition = (typeof PERSPECTIVE_CONDITIONS)[number]

export const SCALE_STATUSES = ['absent', 'draft', 'checked', 'failed_check'] as const
export type PlaneScaleStatus = (typeof SCALE_STATUSES)[number]

export type ScalePointPair = {
  a: PixelPoint
  b: PixelPoint
}

export type ScaleUncertainty = {
  /** Same unit as the measured reference. */
  value: number
  source: 'user' | 'unknown'
}

export type ScaleIndependentCheck = {
  points: ScalePointPair
  knownValue: number
  unit: ScaleUnit
  residualRel: number
  passed: boolean
}

export type PlaneScaleReference = {
  id: string
  plane: ScalePlane
  purpose: ScalePurpose
  points: ScalePointPair
  measuredValue: number
  unit: ScaleUnit
  perspective: PerspectiveCondition
  uncertainty: ScaleUncertainty
  confirmed: boolean
  check: ScaleIndependentCheck | null
}

/**
 * Binds a stored scale to one image plane.
 * Resolution alone is not identity — sourceId + original size + generation must match.
 */
export type PlaneScaleBinding = {
  source: 'camera' | 'synthetic' | 'file'
  /** File name+size, camera device, or `synthetic`. Not WxH alone. */
  sourceId: string
  width: number
  height: number
  setupId: string
  imageGeneration: number
}

/**
 * User-defined measured reference in the relevant image plane.
 * Never invented from a default wheel diameter. pixelsPerUnit is derived
 * only after an independent known-length check passes.
 */
export type PlaneScale = {
  schemaVersion: typeof PLANE_SCALE_SCHEMA_VERSION
  status: PlaneScaleStatus
  references: PlaneScaleReference[]
  pixelsPerUnit: number | null
  unit: ScaleUnit | null
  notes: string[]
  /** Always false — this product does not assume a wheel diameter. */
  defaultWheelDiameter: false
  /** Product mm advice stays off in this stage even after a confirmed scale. */
  productLengthAdvice: false
  /** Present on live/storage rows. Legacy / unbound results stay null. */
  binding?: PlaneScaleBinding | null
}

export type ScalePlaceTarget = 'refA' | 'refB' | 'checkA' | 'checkB'
