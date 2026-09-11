export { MetricsPanel } from './MetricsPanel.tsx'
export type { MetricsPanelProps } from './MetricsPanel.tsx'
export {
  computeMetricsReport,
  createMetricsPipeline,
  emptyMetricsReport,
  DEFAULT_METRICS_OPTIONS,
} from './pipeline.ts'
export type { MetricsPipeline } from './pipeline.ts'
export { detectCycles, pedalAngleDeg, pedalCanTrack, nearTdc, crossedTdc } from './cycles.ts'
export { kneeFlexionDeg, trunkTorsoDeg, elbowFlexionDeg } from './angles.ts'
export {
  estimateAtBdc,
  inBdcWindow,
  crankDistanceToBdc,
  BDC_ANGLE_DEG,
  BDC_WINDOW_HALF_DEG,
} from './bdc.ts'
export {
  createMeasurementCapture,
  emptyMeasurementSnapshot,
  DEFAULT_CAPTURE_COUNTDOWN_SEC,
  DEFAULT_CAPTURE_TARGET_REVS,
} from './capture.ts'
export type { MeasurementCapture, MeasurementSnapshot, MeasurementCaptureOptions } from './capture.ts'
export { runMetricsHarness, summarizeReport } from './harness.ts'
export type { MetricsHarnessResult, MetricsHarnessCase } from './harness.ts'
