export function CycleProgress({ n, m, phase }: { n: number; m: number; phase: string }) {
  const ratio = m <= 0 ? 0 : Math.min(1, n / m)
  return (
    <div className="cycle-progress" data-cycle-progress={`${n}/${m}`}>
      <div className="cycle-progress-bar" style={{ width: `${ratio * 100}%` }} />
      <p>
        <strong>
          {n} von {m} gültigen Umdrehungen
        </strong>
        <span>{phase === 'running' ? 'Aufnahme läuft' : phase === 'complete' ? 'fertig' : 'bereit'}</span>
      </p>
    </div>
  )
}
