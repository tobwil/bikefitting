export { classifyLocalFile, FILE_ACCEPT } from './classify.ts'
export { openLocalFile, revokeObjectUrl, createStillImageStream } from './openLocal.ts'
export {
  mediaTimestampMs,
  seekKind,
  shouldResetOnSeek,
  classifyTimelineDiscontinuity,
  isHeldFrame,
  SEEK_RESET_GAP_MS,
  frameStepSeconds,
  clampMediaTimeSec,
} from './mediaClock.ts'
export type { TimelineSource, TimelineDiscontinuityKind } from './mediaClock.ts'
export { applySeekReset, applyFileTransportSeek } from './seekReset.ts'
export { applyFileMetaPatch, fileSourceKey, isSameFileBind, isSameStreamBind } from './meta.ts'
export {
  IDENTITY_SOURCE_TRANSFORM,
  isIdentityTransform,
  rotatePoint,
  unrotatePoint,
  workingToOriginal,
  originalToWorking,
  remapLandmarksToOriginal,
  blitWorkingFrame,
  drawSourceTransform,
  nextRotation,
  insetCrop,
  workingSize,
  sourceTransformForCapture,
} from './frameTransform.ts'
export {
  playFile,
  pauseFile,
  toggleFilePlayback,
  seekFile,
  restartFile,
  stepFileFrame,
  snapshotPlayback,
  presentFilePlayback,
} from './playback.ts'
export { cycleMeasurementAllowed, isStaticCheckKind, staticCheckQualityNote } from './staticCheck.ts'
export { fileFixtureClip, FILE_FIXTURE_ID, FILE_FIXTURE_WIDTH, FILE_FIXTURE_HEIGHT } from './fixture.ts'
export { runFileHarness } from './harness.ts'
export { FileSourcePanel } from './FileSourcePanel.tsx'
export type { FileSourcePanelProps } from './FileSourcePanel.tsx'
export { ReplayBar } from './ReplayBar.tsx'
export type { ReplayBarProps } from './ReplayBar.tsx'
