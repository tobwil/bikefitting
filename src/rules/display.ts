import type { AmpelPresentation, RuleDecision, RuleProfile } from '../types/rules.ts'

export const AMPEL_LABEL_PRODUCTION = 'Ampel (produktiv)'
export const AMPEL_LABEL_PROVISIONAL = 'Provisorische Bewertung — nicht fachlich freigegeben'
export const AMPEL_LABEL_UNAVAILABLE = 'Bewertung nicht verfügbar'

function toneForState(state: RuleDecision['state']): AmpelPresentation['tone'] {
  if (state === 'within_target') return 'green'
  if (state === 'borderline') return 'yellow'
  if (state === 'outside_target') return 'red'
  return 'gray'
}

/**
 * Productive Ampel only when the profile is `productionEnabled` and the UI
 * shows `AMPEL_LABEL_PRODUCTION`. Otherwise gray unavailable, or — when
 * `allowProvisionalPlumbing` is on — clearly labeled provisional colors.
 */
export function presentAmpel(
  profile: RuleProfile | null,
  decision: RuleDecision,
  allowProvisionalPlumbing = false,
): AmpelPresentation {
  const productionOk = Boolean(profile?.productionEnabled)
  if (productionOk) {
    return {
      state: decision.state,
      tone: toneForState(decision.state),
      label: AMPEL_LABEL_PRODUCTION,
      productionAmpel: true,
      plumbingOnly: false,
    }
  }

  if (allowProvisionalPlumbing && decision.state !== 'unavailable') {
    return {
      state: decision.state,
      tone: toneForState(decision.state),
      label: AMPEL_LABEL_PROVISIONAL,
      productionAmpel: false,
      plumbingOnly: true,
    }
  }

  return {
    state: 'unavailable',
    tone: 'gray',
    label: AMPEL_LABEL_UNAVAILABLE,
    productionAmpel: false,
    plumbingOnly: false,
  }
}
