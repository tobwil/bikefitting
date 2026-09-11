import { FLOW_STEP_META, FLOW_STEPS, type FlowStepId } from '../constants.ts'

type StepperProps = {
  current: FlowStepId
  onSelect: (step: FlowStepId) => void
}

export function Stepper({ current, onSelect }: StepperProps) {
  const currentIndex = FLOW_STEPS.indexOf(current)
  return (
    <nav className="flow-stepper" aria-label="Messablauf">
      {FLOW_STEPS.map((id, index) => {
        const meta = FLOW_STEP_META[id]
        const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'todo'
        return (
          <button
            key={id}
            type="button"
            className={`flow-step flow-step-${state}`}
            disabled={index > currentIndex}
            onClick={() => onSelect(id)}
            data-flow-step-tab={id}
          >
            <span className="flow-step-n">{meta.n}</span>
            <span className="flow-step-label">{meta.kicker}</span>
          </button>
        )
      })}
    </nav>
  )
}
