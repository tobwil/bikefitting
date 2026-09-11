import { FitProvider } from './shell/FitSession.tsx'
import { FlowApp } from './flow/FlowApp.tsx'
import { FlowProvider } from './flow/FlowProvider.tsx'
import './flow/flow.css'

function App() {
  return (
    <FitProvider>
      <FlowProvider>
        <FlowApp />
      </FlowProvider>
    </FitProvider>
  )
}

export default App
