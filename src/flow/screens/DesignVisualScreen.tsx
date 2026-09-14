import { CaptureHud } from '../../capture/CaptureHud.tsx'
import { CompareCard } from '../../change/CompareCard.tsx'
import { DocumentChangeForm } from '../../change/DocumentChangeForm.tsx'
import { compareDocumentedChange } from '../../change/compare.ts'
import { createDocumentedChange } from '../../change/document.ts'
import type { CaptureSetupFingerprint, ObservationSnapshot } from '../../types/change.ts'
import { emptySetup } from '../../change/setup.ts'
import { OutcomeCard } from '../components/OutcomeCard.tsx'
import { QualityMark } from '../components/QualityMark.tsx'
import { BeginnerStepper } from '../components/BeginnerStepper.tsx'
import { QualityBlock } from '../components/AmpelNotice.tsx'
import { stubAnalyzeCapture } from '../analysisStub.ts'
import { decideFromObservation, outcomeView } from '../outcome.ts'
import type { CaptureAsset } from '../../types/capture.ts'
import '../beginner.css'

function asset(): CaptureAsset {
  return {
    kind: 'bikefit.capture',
    schemaVersion: 1,
    captureId: 'cap-design',
    blobKey: 'cap-design',
    contentHash: 'hash',
    mimeType: 'video/webm',
    codec: 'vp8',
    durationMs: 40000,
    width: 1920,
    height: 1080,
    rotationDeg: 0,
    captureType: 'continuity',
    completeness: 'complete',
    intendedDurationMs: 40000,
    createdAt: '2026-09-14T12:00:00.000Z',
    hasAudio: false,
    byteLength: 1,
    filename: 'clip.webm',
  }
}

function fixtureSnap(): ObservationSnapshot {
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
  }
}

export function DesignVisualScreen() {
  const observation = stubAnalyzeCapture({ asset: asset() })
  const action = decideFromObservation(observation)
  const view = outcomeView({ action, observation, hasCaptureAsset: true })
  const before = fixtureSnap()
  const change = createDocumentedChange({
    previous: before,
    direction: 'higher',
    source: 'user_path',
    id: 'chg-design',
    createdAt: '2026-09-14T13:00:00.000Z',
  })
  const comparison = compareDocumentedChange({
    change,
    after: { ...before, resultId: 'res-b', captureId: 'cap-b', analysisId: 'an-b', valueDeg: 43 },
  })

  return (
    <div className="app" data-mode="flow" data-screen="design-visual" data-beginner="true">
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">BikeFit Mac</span>
          <span className="gate">Lokal</span>
        </div>
        <p className="mast-note">Einrichten · Aufnehmen · Ergebnis. Countdown und Auswertung sind Zustände.</p>
      </header>
      <BeginnerStepper current="setup" />
      <main className="design-visual-main">
        <section>
          <h2>Header während der Aufnahme</h2>
          <BeginnerStepper current="record" locked />
        </section>
        <section>
          <h2>Header beim Ergebnis</h2>
          <BeginnerStepper current="result" />
        </section>
        <div className="design-visual-grid">
          <figure className="design-visual-item">
            <figcaption>Countdown — lesbar vom Rad, keine Aufnahme-Farbe</figcaption>
            <div className="design-stage-mock">
              <CaptureHud
                connected
                phase="countdown"
                countdownRemainingMs={8200}
                recordRemainingMs={40000}
                flash={null}
                hint={null}
              />
            </div>
          </figure>
          <figure className="design-visual-item">
            <figcaption>Aufnahme läuft — einzige Aufnahme-Farbe</figcaption>
            <div className="design-stage-mock">
              <CaptureHud
                connected
                phase="recording"
                countdownRemainingMs={0}
                recordRemainingMs={27500}
                flash="start"
                hint={null}
              />
            </div>
          </figure>
        </div>
        <div className="design-visual-grid">
          <figure className="design-visual-item">
            <figcaption>Qualität als Text und Icon</figcaption>
            <QualityMark level="ok" />
            <QualityMark level="borderline" />
            <QualityMark level="insufficient" />
            <QualityBlock
              label="Qualität ausreichend"
              level="ok"
              notes={['Text bleibt lesbar, auch ohne Ampel-Farbe.']}
              ampel={false}
            />
          </figure>
          <figure className="design-visual-item">
            <figcaption>Ergebnis zuerst als Handlungskarte</figcaption>
            <OutcomeCard view={view} onPrimary={() => undefined} allowDocument onDocument={() => undefined} />
          </figure>
          <figure className="design-visual-item">
            <figcaption>Änderung dokumentieren — Zustand von Ergebnis</figcaption>
            <DocumentChangeForm action={null} onCancel={() => undefined} onSubmit={() => undefined} />
          </figure>
          <figure className="design-visual-item">
            <figcaption>Vergleich — Zahlen unter Warum?</figcaption>
            <CompareCard comparison={comparison} />
          </figure>
        </div>
      </main>
    </div>
  )
}
