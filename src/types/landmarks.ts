export const POSE_LANDMARK = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

export type LandmarkName = keyof typeof POSE_LANDMARK
export type LandmarkIndex = (typeof POSE_LANDMARK)[LandmarkName]

export type Landmark = {
  x: number
  y: number
  z: number
  visibility: number
  presence?: number
}

export type CameraNearSide = 'left' | 'right'

export const IST_CHAIN = {
  arm: ['SHOULDER', 'ELBOW', 'WRIST'] as const,
  leg: ['SHOULDER', 'HIP', 'KNEE', 'ANKLE', 'HEEL', 'FOOT_INDEX'] as const,
}

export type PoseEngineId = 'mediapipe' | 'synthetic'

export type PoseFrame = {
  timestampMs: number
  videoWidth: number
  videoHeight: number
  landmarks: Landmark[]
  worldLandmarks?: Landmark[]
  inferenceMs?: number
  engine: PoseEngineId
  /** MediaPipe variant when engine is mediapipe. Product default is lite. */
  model?: 'lite' | 'full'
  nearSide?: CameraNearSide
}
