import type { MeasurePhase } from '../types.ts'

export function Countdown({ phase, count }: { phase: MeasurePhase; count: number }) {
  if (phase !== 'countdown') return null
  return (
    <div className="countdown" data-countdown={count} role="status">
      <p className="kicker">Aufnahme</p>
      <strong>{count > 0 ? count : 'Los'}</strong>
      <p>Nicht auf den Bildschirm schauen. Ton am Anfang und Ende.</p>
    </div>
  )
}
