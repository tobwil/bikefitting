import { ampelAllowed } from '../profile.ts'
import type { FitProfile, QualityLevel } from '../types.ts'

export function AmpelNotice({ profile }: { profile: FitProfile }) {
  if (ampelAllowed(profile)) {
    return (
      <p className="ampel-notice is-on" data-ampel="on">
        Ampel aktiv — Profil {profile.name} (productionEnabled).
      </p>
    )
  }
  return (
    <p className="ampel-notice" data-ampel="locked">
      Keine produktive Ampel — Profil {profile.name} ohne productionEnabled.
    </p>
  )
}

export function QualityBlock({
  label,
  level,
  notes,
  ampel,
}: {
  label: string
  level: QualityLevel
  notes: string[]
  ampel: boolean
}) {
  return (
    <section className={`quality-block ${ampel ? `is-${level}` : 'is-plain'}`} data-quality={level}>
      <p className="kicker">Qualität</p>
      <h3>{label}</h3>
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </section>
  )
}
