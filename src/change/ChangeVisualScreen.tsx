import { CHANGE_COPY } from './copy.ts'
import { CompareCard } from './CompareCard.tsx'
import { DocumentChangeForm } from './DocumentChangeForm.tsx'
import { compareDocumentedChange } from './compare.ts'
import { createDocumentedChange } from './document.ts'
import type { CaptureSetupFingerprint, ObservationSnapshot } from '../types/change.ts'
import { emptySetup } from './setup.ts'

function fixtureSnap(over: Partial<ObservationSnapshot> = {}): ObservationSnapshot {
  return {
    resultId: 'res-a',
    captureId: 'cap-a',
    analysisId: 'an-a',
    metricId: 'knee_flexion',
    method: 'max_extension',
    methodVersion: 'max_extension.p10.v1',
    valueDeg: 42,
    cycles: 12,
    side: 'right',
    profileId: 'lab',
    profileReleased: false,
    ruleId: null,
    targetLowDeg: null,
    targetHighDeg: null,
    setup: {
      ...emptySetup(),
      deviceId: 'cam-iphone',
      cameraKind: 'continuity',
      captureType: 'continuity',
      width: 1920,
      height: 1080,
      geometryRevision: 1,
      setupId: 'camera:cam-iphone:1920x1080:r1',
    } satisfies CaptureSetupFingerprint,
    actionKind: 'review',
    ...over,
  }
}

const before = fixtureSnap()
const change = createDocumentedChange({
  previous: before,
  direction: 'higher',
  source: 'user_path',
  id: 'chg-visual',
  createdAt: '2026-09-14T13:00:00.000Z',
})

const FIXTURES = [
  {
    id: 'compatible-small',
    title: 'Kleine Differenz → keine sichere Veränderung',
    comparison: compareDocumentedChange({
      change,
      after: fixtureSnap({ resultId: 'res-b', captureId: 'cap-b', analysisId: 'an-b', valueDeg: 43 }),
    }),
  },
  {
    id: 'incompatible-camera',
    title: 'Kamerawechsel → nicht vergleichbar',
    comparison: compareDocumentedChange({
      change,
      after: fixtureSnap({
        resultId: 'res-c',
        captureId: 'cap-c',
        analysisId: 'an-c',
        valueDeg: 30,
        setup: {
          ...before.setup,
          deviceId: 'cam-mac',
          cameraKind: 'mac_webcam',
          captureType: 'webcam',
          width: 1280,
          height: 720,
          geometryRevision: 2,
          setupId: 'camera:cam-mac:1280x720:r2',
        },
      }),
    }),
  },
  {
    id: 'incompatible-method',
    title: 'BDC vs max_extension → nicht vergleichbar',
    comparison: compareDocumentedChange({
      change,
      after: fixtureSnap({
        resultId: 'res-d',
        captureId: 'cap-d',
        analysisId: 'an-d',
        method: 'bottom_dead_center',
        methodVersion: 'bdc.v1',
        valueDeg: 32,
      }),
    }),
  },
] as const

export function ChangeVisualScreen() {
  return (
    <div className="app" data-mode="flow" data-screen="change-visual">
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">BikeFit Mac</span>
          <span className="gate">Änderung · visuell</span>
        </div>
        <p className="mast-note">
          {CHANGE_COPY.repeatabilityNote} Kein „verbessert“. Kamerawechsel ist keine Körperveränderung.
        </p>
      </header>
      <main className="outcome-visual-main">
        <figure className="outcome-visual-item" data-fixture="document-form">
          <figcaption>Änderung dokumentieren</figcaption>
          <DocumentChangeForm action={null} onCancel={() => undefined} onSubmit={() => undefined} />
        </figure>
        {FIXTURES.map((item) => (
          <figure key={item.id} className="outcome-visual-item" data-fixture={item.id}>
            <figcaption>{item.title}</figcaption>
            <CompareCard comparison={item.comparison} />
          </figure>
        ))}
      </main>
    </div>
  )
}
