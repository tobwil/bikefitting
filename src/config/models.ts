export const MEDIAPIPE_TASKS_VISION = '0.10.35'

export const POSE_MODEL_FILES = {
  lite: {
    file: 'pose_landmarker_lite.task',
    url: '/models/pose_landmarker_lite.task',
    source:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    versionPath: 'pose_landmarker_lite/float16/1',
  },
  full: {
    file: 'pose_landmarker_full.task',
    url: '/models/pose_landmarker_full.task',
    source:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    versionPath: 'pose_landmarker_full/float16/1',
  },
} as const

export const WASM_BASE_URL = '/models/wasm'
export const DEFAULT_POSE_MODEL = 'lite' as const
