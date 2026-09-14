import { makeBuildInfo, type BikeFitBuildInfo } from '../local/buildInfo.ts'

/** Commit/version baked in by Vite `define`. */
export function appBuildInfo(): BikeFitBuildInfo {
  return makeBuildInfo({
    version: __BIKEFIT_VERSION__,
    commit: __BIKEFIT_COMMIT__,
  })
}
