import { ampelAllowed } from '../profile.ts'
import type { FitProfile, QualityLevel } from '../types.ts'
import { QualityMark } from './QualityMark.tsx'

export function AmpelNotice({ profile }: { profile: FitProfile }) {
  if (ampelAllowed(profile)) {
    return (
      <p className="ampel-notice is-on" data-ampel="on">
        Farbige Bewertung aktiv — Profil {profile.name}.
      </p>
    )
  }
  return (
    <p className="ampel-notice" data-ampel="locked">
      Keine farbige Bewertung in dieser Version. Die Messung bleibt eine Beobachtung.
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
      <h3>
        <QualityMark level={level} label={label} />
      </h3>
      {notes.map((note) => (
        <p key={note}>{note}</p>
      ))}
    </section>
  )
}
