import { BEGINNER_HEADER_STEPS, type BeginnerHeaderId } from '../beginnerJourney.ts'

export function BeginnerStepper({
  current,
  locked = false,
  onHome,
}: {
  current: BeginnerHeaderId
  locked?: boolean
  onHome?: () => void
}) {
  const currentIndex = BEGINNER_HEADER_STEPS.findIndex((step) => step.id === current)
  return (
    <nav className="beginner-stepper" aria-label="Ablauf" data-beginner-stepper data-current={current}>
      {onHome && (
        <button type="button" className="beginner-home" onClick={onHome} disabled={locked} data-action="beginner-home">
          Zur Startseite
        </button>
      )}
      <ol className="beginner-step-pills">
        {BEGINNER_HEADER_STEPS.map((step, index) => {
          const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'
          return (
            <li key={step.id} className={`beginner-step beginner-step-${state}`} data-beginner-tab={step.id}>
              <span className="beginner-step-n" aria-hidden="true">
                {index + 1}
              </span>
              <span className="beginner-step-label">
                {step.label}
                {state === 'current' ? <span className="visually-hidden"> (aktuell)</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
