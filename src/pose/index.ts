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
  poseIsReady,
  acceptSessionReply,
  applyDetectToRuntimeFails,
  isDetectTimeout,
  shouldMarkWorkerTimeout,
} from './freshness.ts'
export type { PoseFreshness, PoseFreshnessStatus } from './freshness.ts'
export { startVideoFrameLoop, findPoseVideo } from './frameSync.ts'
export { inferNearSide, visibleJoint, visibleChainSegments } from './nearSide.ts'
export { syntheticPoseFrame } from './syntheticLandmarks.ts'
