import type { CaptureAsset } from '../../types/capture.ts'
import { OBSERVATION_KIND, OBSERVATION_SCHEMA_VERSION, type ObservationReport } from '../../types/observation.ts'
import { stubAnalyzeCapture } from '../analysisStub.ts'
import { OutcomeCard } from '../components/OutcomeCard.tsx'
import { decideFromObservation, outcomeView } from '../outcome.ts'

function asset(over: Partial<CaptureAsset> = {}): CaptureAsset {
  return {
    kind: 'bikefit.capture',
    schemaVersion: 1,
    captureId: 'cap-visual',
    blobKey: 'cap-visual',
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
    ...over,
  }
}

function ap05(): ObservationReport {
  return {
    kind: OBSERVATION_KIND,
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    captureId: 'cap-visual',
    analysisId: 'an-max',
    jobId: 'job-max',
    inputHash: 'hash',
    pipelineVersion: 'max_extension.p10.v1',
    status: 'usable',
    reasons: [],
    reasonText: 'Kniebeugung nahe größter Streckung aus zehn Zyklen.',
    method: 'max_extension',
    methodVersion: 'max_extension.p10.v1',
    phaseSource: 'motion_estimate',
    side: 'right',
    mediaStartMs: 2000,
    mediaEndMs: 38000,
    geometryRevision: 1,
    metrics: [
      {
        id: 'knee_flexion',
        method: 'max_extension',
        methodVersion: 'max_extension.p10.v1',
        value: 42,
        unit: 'deg',
        usableCycles: 12,
        spread: 2.1,
        available: true,
        reasons: [],
        evidenceIds: ['frame:12'],
      },
    ],
    evidence: [{ id: 'frame:12', mediaTimeMs: 8400 }],
    stub: false,
    completedAt: '2026-09-14T12:02:00.000Z',
  }
}

const FIXTURES = [
  { id: 'stub-complete', title: 'Stub nach vollständigem Clip → Prüfen', observation: stubAnalyzeCapture({ asset: asset() }) },
  {
    id: 'incomplete-clip',
    title: 'Unvollständiger Clip → Neu aufnehmen',
    observation: stubAnalyzeCapture({ asset: asset({ completeness: 'incomplete', durationMs: 3000 }) }),
  },
  {
    id: 'failed-decode',
    title: 'Analysefehler → Prüfen mit Grund',
    observation: stubAnalyzeCapture({
      asset: asset(),
      failure: { code: 'decoder_failed', message: 'Clip lässt sich nicht dekodieren (Codec).' },
    }),
  },
  { id: 'ap05-max-extension', title: 'AP-05 max_extension ohne Freigabe → Prüfen', observation: ap05() },
] as const

export function OutcomeVisualScreen() {
  return (
    <div className="app" data-mode="flow" data-screen="outcome-visual">
      <header className="mast">
        <div className="mast-brand">
          <span className="wordmark">BikeFit Mac</span>
          <span className="gate">Ergebnis · visuell</span>
        </div>
        <p className="mast-note">
          Eine Ergebniskarte, verdrahtet mit ActionDecision. Keine Sattelrichtung aus Stub oder
          unfreigegebenen Methoden. JSON und Diagnose bleiben unter Details.
        </p>
      </header>
      <main className="outcome-visual-main">
        {FIXTURES.map((item) => {
          const action = decideFromObservation(item.observation)
          const view = outcomeView({ action, observation: item.observation, hasCaptureAsset: true })
          return (
            <figure key={item.id} data-fixture={item.id} className="outcome-visual-item">
              <figcaption>{item.title}</figcaption>
              <OutcomeCard view={view} onPrimary={() => undefined} />
            </figure>
          )
        })}
      </main>
    </div>
  )
}
