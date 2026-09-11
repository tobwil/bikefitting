export { PoseOverlay } from './PoseOverlay.tsx'
export type { PoseOverlayProps } from './PoseOverlay.tsx'
export { ComparePanel } from './ComparePanel.tsx'
export { createPoseEngine } from './createPoseEngine.ts'
export { runCompareHarness } from './compare/harness.ts'
export { createCompareRunner } from './compare/runCompare.ts'
export { formatDecisionNote } from './compare/decision.ts'
export type { PoseEngineHandle, PoseEngineFactory } from './createPoseEngine.ts'
export type { PoseEngine, PoseEngineOptions, PoseDetectResult, PoseDetectStatus } from '../types/pose-engine.ts'
export {
  poseFreshness,
  poseHoldForSource,
  poseIsReady,
  poseReceiveTime,
  acceptSessionReply,
  applyDetectToRuntimeFails,
  isDetectTimeout,
  shouldMarkWorkerTimeout,
} from './freshness.ts'
export type { PoseFreshness, PoseFreshnessStatus, PoseHold, PoseSourceKind } from './freshness.ts'
export { startVideoFrameLoop, findPoseVideo } from './frameSync.ts'
export type { FrameDiscontinuity } from './frameSync.ts'
export { inferNearSide, visibleJoint, visibleChainSegments } from './nearSide.ts'
export { syntheticPoseFrame } from './syntheticLandmarks.ts'
export {
  OverlayPoseFilter,
  overlayFilterFromSearch,
  poseForMetrics,
  OVERLAY_FILTER_PARAMS,
  EMPTY_OVERLAY_FILTER_STATUS,
} from './overlayFilter.ts'
export type { OverlayFilterStatus, OverlayFilterApply } from './overlayFilter.ts'
export { compareOverlayKnees, reportOverlayDelay, kneeDegFromPose } from './overlayEval.ts'
export type { OverlayCompareSample, OverlayDelayReport } from './overlayEval.ts'
export { runOverlayFilterHarness } from './overlayHarness.ts'
