import { CameraPanel } from './camera/index.ts'
import { PoseOverlay } from './pose/index.ts'
import { CalibrationPanel } from './calibration/index.ts'
import { PedalPanel } from './pedal/index.ts'
import { AppShell } from './shell/AppShell.tsx'
import { StagePlaceholder } from './shell/StagePlaceholder.tsx'

/**
 * Integration owner (scaffold). Wires module slots only.
 * Implement camera / pose / calibration / pedal inside their folders.
 */
function App() {
  return (
    <AppShell
      stage={<StagePlaceholder />}
      camera={<CameraPanel />}
      pose={<PoseOverlay />}
      calibration={<CalibrationPanel />}
      pedal={<PedalPanel />}
    />
  )
}

export default App
