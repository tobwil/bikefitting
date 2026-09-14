import { LOCAL_APP_ID, LOCAL_ORIGIN } from './constants.ts'

export type BikeFitBuildInfo = {
  app: typeof LOCAL_APP_ID
  version: string
  commit: string
  origin: string
}

export function isBikeFitBuildInfo(value: unknown): value is BikeFitBuildInfo {
  if (value === null || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    row.app === LOCAL_APP_ID &&
    typeof row.version === 'string' &&
    row.version.length > 0 &&
    typeof row.commit === 'string' &&
    row.commit.length > 0 &&
    typeof row.origin === 'string' &&
    row.origin.startsWith('http://127.0.0.1')
  )
}

export function parseBuildInfo(value: unknown): BikeFitBuildInfo | null {
  return isBikeFitBuildInfo(value) ? value : null
}

export function makeBuildInfo(input: { version: string; commit: string; origin?: string }): BikeFitBuildInfo {
  return {
    app: LOCAL_APP_ID,
    version: input.version,
    commit: input.commit,
    origin: input.origin ?? LOCAL_ORIGIN,
  }
}
