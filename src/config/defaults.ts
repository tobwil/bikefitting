export const APP_NAME = 'BikeFit Mac'
export const GATE = 'E0 + E5 P0'
export const DEV_PORT = 47321
export const MIN_LANDMARK_VISIBILITY = 0.75
const viteEnv = import.meta.env as { DEV?: boolean; VITE_ALLOW_SYNTHETIC?: string } | undefined
export const ALLOW_SYNTHETIC_FIXTURE =
  Boolean(viteEnv?.DEV || viteEnv?.VITE_ALLOW_SYNTHETIC === '1')
