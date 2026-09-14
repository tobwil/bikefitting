import type { QualityLevel } from '../types.ts'

const LABEL: Record<QualityLevel, string> = {
  ok: 'Qualität ausreichend',
  borderline: 'Qualität grenzwertig',
  insufficient: 'Qualität unzureichend',
}

export function QualityMark({
  level,
  label,
}: {
  level: QualityLevel
  label?: string
}) {
  const text = label ?? LABEL[level]
  return (
    <p className={`quality-mark is-${level}`} data-quality-mark={level}>
      <QualityIcon level={level} />
      <span data-quality-text>{text}</span>
    </p>
  )
}

function QualityIcon({ level }: { level: QualityLevel }) {
  if (level === 'ok') {
    return (
      <svg viewBox="0 0 24 24" className="quality-icon" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12.2 10.6 15 16 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (level === 'borderline') {
    return (
      <svg viewBox="0 0 24 24" className="quality-icon" aria-hidden="true">
        <path d="M12 4 21 20H3L12 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 10v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="17.2" r="0.9" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="quality-icon" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
