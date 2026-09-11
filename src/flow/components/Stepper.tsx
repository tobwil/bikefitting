import { FLOW_STEP_META, FLOW_STEPS, type FlowStepId } from '../constants.ts'

type StepperProps = {
  current: FlowStepId
  onSelect: (step: FlowStepId) => void
  locked?: boolean
}

export function Stepper({ current, onSelect, locked = false }: StepperProps) {
  const currentIndex = FLOW_STEPS.indexOf(current)
  const currentMeta = FLOW_STEP_META[current]
  return (
    <nav className="flow-stepper" aria-label="Messablauf">
      <p className="flow-step-now">
        <span className="kicker">
          {currentMeta.n} / {FLOW_STEPS.length}
        </span>
        <strong>{currentMeta.kicker}</strong>
      </p>
      <div className="flow-step-pills">
        {FLOW_STEPS.map((id, index) => {
          const meta = FLOW_STEP_META[id]
          const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'
          return (
            <button
              key={id}
              type="button"
              className={`flow-step flow-step-${state}`}
              disabled={locked || index > currentIndex}
              onClick={() => onSelect(id)}
              data-flow-step-tab={id}
              title={meta.title}
            >
              <span className="flow-step-n">{meta.n}</span>
              <span className="flow-step-label">{meta.kicker}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
