import type { ActionReleaseStatus, RuleProfileLike } from '../types/action.ts'
import { ACTION_RELEASE_STATUSES } from '../types/action.ts'

/**
 * Fachliche Freigabe for a directional beginner action.
 * URL flags and product-channel profiles (`?profile=production`) are irrelevant.
 */
export function isReleasedProfile(profile: RuleProfileLike | null | undefined): boolean {
  if (!profile) return false
  return (
    profile.status === 'approved' &&
    profile.productionEnabled === true &&
    profile.reviewedAt != null &&
    profile.reviewedAt !== ''
  )
}

export function releaseStatusOf(profile: RuleProfileLike | null | undefined): ActionReleaseStatus {
  if (!profile) return 'missing'
  if ((ACTION_RELEASE_STATUSES as readonly string[]).includes(profile.status)) {
    return profile.status as ActionReleaseStatus
  }
  return 'missing'
}
