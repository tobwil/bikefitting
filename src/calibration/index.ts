export { CalibrationPanel } from './CalibrationPanel.tsx'
export type { CalibrationPanelProps, CalibrationDetectApi } from './CalibrationPanel.tsx'
export { MARK_GUIDE, MARK_ORDER, markTitle } from './marks.ts'
export { computePixelBikeTransform, pixelToBike, bikeToPixel } from './transform.ts'
export { measureKneeAngle } from './kneeAngle.ts'
export { loadCalibration, saveCalibration, emptyCalibration } from './storage.ts'
export { assessCalibration, isCalibrationReady } from './validity.ts'
export type { CalibrationAssessment, CalibrationIssue } from './validity.ts'
export { runCalibrationHarness } from './harness.ts'
export {
  proposeFromImage,
  proposeFromFixture,
  confirmProposal,
  confirmGripContact,
  correctPoint,
  applyConfirmed,
  applyManualMark,
  sameCalibGeneration,
  fallbackManual,
  emptyDetectSession,
  gripContactPending,
  confirmGripOnCalibration,
  restoreDetectGrip,
  beginDetectRun,
  cancelDetectRun,
  sessionFromDetect,
} from './propose.ts'
export type { DetectSession, DetectPhase } from './propose.ts'
export { guessFacing, renderGoldRectangle, shiftPixelImage, downsampleDetectImage } from './detect.ts'
export { createDetectEngine } from './detectEngine.ts'
export { pointStatusLabel, viewQualityLabel } from './statusCopy.ts'
export {
  IDENTITY_VIEW,
  clampPan,
  focusOn,
  inView,
  zoomAround,
} from './viewTransform.ts'
