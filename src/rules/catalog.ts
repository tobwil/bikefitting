import type { RuleProfile } from '../types/rules.ts'
import { parseRuleProfile } from './schema.ts'
import kneeFlexionBdc from './profiles/knee-flexion-bdc.provisional.v1.json' with { type: 'json' }
import kneeFlexionNutzerziel from './profiles/knee-flexion.nutzerziel.v1.json' with { type: 'json' }

const RAW_PROFILES: unknown[] = [kneeFlexionBdc, kneeFlexionNutzerziel]

export const RULE_PROFILES: RuleProfile[] = RAW_PROFILES.map(parseRuleProfile)

export const DEFAULT_RULE_PROFILE_ID = 'knee-flexion-bdc.v1'

export function getRuleProfile(id: string): RuleProfile | null {
  return RULE_PROFILES.find((profile) => profile.id === id) ?? null
}

export function shippedProductionProfiles(): RuleProfile[] {
  return RULE_PROFILES.filter((profile) => profile.productionEnabled)
}
