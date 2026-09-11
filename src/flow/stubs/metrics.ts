import { computeLiveCards } from '../liveMetrics.ts'
import type { LiveMetricInput, MetricsApi } from '../contracts.ts'
import { qualityFromReport } from '../bindMetrics.ts'

export const stubMetrics: MetricsApi = {
  source: 'stub',
  liveCards(input: LiveMetricInput) {
    return computeLiveCards({
      frame: input.pose,
      kneeDegrees: input.kneeDegrees,
      kneeVisible: input.kneeVisible,
    })
  },
  quality(input) {
    return qualityFromReport(input)
  },
}
