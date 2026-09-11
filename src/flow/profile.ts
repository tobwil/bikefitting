import { shippedProductionProfiles } from '../rules/catalog.ts'
import type { FitProfile } from './types.ts'

export const LAB_PROFILE: FitProfile = {
  id: 'lab',
  name: 'Labor / nicht freigegeben',
  productionEnabled: false,
}

/** Opt-in URL only. Still requires a shipped rule profile with productionEnabled. */
export const PRODUCTION_PROFILE: FitProfile = {
  id: 'production',
  name: 'Freigegebenes Testprofil',
  productionEnabled: true,
}

export function profileFromLocation(search = window.location.search): FitProfile {
  const params = new URLSearchParams(search)
  return params.get('profile') === 'production' ? PRODUCTION_PROFILE : LAB_PROFILE
}

export function ampelAllowed(profile: FitProfile): boolean {
  return profile.productionEnabled === true && shippedProductionProfiles().length > 0
}
