import { emptyBodyModel, estimateBodyModel, scaledBodyModel } from '../soll/segments.ts'
import { solveSoll } from '../soll/solver.ts'
import type { OverlayGhost } from '../shell/drawGhost.ts'
import type { SollApi } from './contracts.ts'

export const realSoll: SollApi = {
  source: 'module',
  ghost(input) {
    const estimated = estimateBodyModel(input.calibration) ?? emptyBodyModel()
    const result = solveSoll({
      mode: 'current_setup',
      calibration: input.calibration,
      pedal: input.pedal,
      phaseSource: 'pedal',
      syntheticPhase01: 0,
      body: scaledBodyModel(estimated, 1),
    })
    const skeleton = result.skeleton
    if (!skeleton) return null
    const ghost: OverlayGhost = {
      kind: 'soll',
      segments: skeleton.chains.flatMap((chain) => {
        const pairs: OverlayGhost['segments'] = []
        for (let i = 1; i < chain.length; i += 1) {
          const a = skeleton.joints[chain[i - 1]!]
          const b = skeleton.joints[chain[i]!]
          if (a && b) pairs.push([a, b])
        }
        return pairs
      }),
      points: Object.values(skeleton.joints),
      label: 'Soll',
      stub: false,
    }
    return ghost
  },
}
