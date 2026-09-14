export type { ChangeLink, DocumentedChange, ChangeComparison, CaptureSetupFingerprint } from '../types/change.ts'
export {
  CHANGE_LINK_KIND,
  CHANGE_LINK_SCHEMA_VERSION,
  DOCUMENTED_CHANGE_KIND,
  REPEATABILITY_BAND_DEG,
} from '../types/change.ts'
export { CHANGE_COPY, assertSafeChangeCopy, directionLabel } from './copy.ts'
export { createDocumentedChange, documentSourceFor, suggestedDirection, snapshotFromResult } from './document.ts'
export { compareDocumentedChange, compatibilityOf, isComparable } from './compare.ts'
export { attachChangeLoop } from './attach.ts'
export { canDocumentChange, documentPathProminent } from './canDocument.ts'
export { setupFromSources, preferredDeviceId, emptySetup } from './setup.ts'
export { parseChangeLink, parseDocumentedChange, parseChangeComparison } from './schema.ts'
export { readPendingChange, writePendingChange, clearPendingChange, PENDING_CHANGE_STORAGE_KEY } from './storage.ts'
export { runChangeHarness } from './harness.ts'
export type { ChangeHarnessResult, ChangeHarnessCase } from './harness.ts'
