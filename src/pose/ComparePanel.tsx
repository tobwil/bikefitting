import { useMemo, useRef, useState } from 'react'
import { FILE_ACCEPT } from '../file/classify.ts'
import { POSE_HEAVY_REASON, POSE_MODEL_FILES } from '../config/models.ts'
import { formatDecisionNote } from './compare/decision.ts'
import {
  extractLocalFileClip,
  fileFixtureCompareClip,
  parseAnnotatedSequence,
  prepareCompareClip,
  syntheticCompareClip,
} from './compare/clips.ts'
import { createCompareRunner } from './compare/runCompare.ts'
import { simulatedDetect, simulatedLoad } from './compare/simulated.ts'
import type { PoseCompareClip, PoseCompareProgress, PoseCompareReport } from '../types/pose-compare.ts'

function fmtMs(value: number): string {
  return `${value.toFixed(1)} ms`
}

function fmtDeg(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)}°`
}

export function ComparePanel() {
  const injected = useMemo(
    () => createCompareRunner({ load: simulatedLoad, detect: simulatedDetect }),
    [],
  )
  const mediapipe = useMemo(() => createCompareRunner(), [])
  const [progress, setProgress] = useState<PoseCompareProgress>({
    phase: 'idle',
    model: null,
    frameIndex: 0,
    frameCount: 0,
    message: '',
  })
  const [report, setReport] = useState<PoseCompareReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const watch = (runner: ReturnType<typeof createCompareRunner>) => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => setProgress(runner.progress()), 80)
  }

  const finish = () => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    setBusy(false)
  }

  const runClip = async (
    clip: PoseCompareClip,
    mode: 'injected' | 'mediapipe',
  ) => {
    setBusy(true)
    setError(null)
    setReport(null)
    const runner = mode === 'injected' ? injected : mediapipe
    const prepared = prepareCompareClip(clip, mode)
    if ('error' in prepared) {
      setError(prepared.error)
      setBusy(false)
      return
    }
    watch(runner)
    try {
      const next = await runner.run(prepared, { detector: mode })
      setReport(next)
      setProgress(runner.progress())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Vergleich fehlgeschlagen.')
      setProgress(runner.progress())
    } finally {
      finish()
    }
  }

  const abort = () => {
    injected.abort()
    mediapipe.abort()
    setBusy(false)
    setProgress({ phase: 'aborting', model: null, frameIndex: 0, frameCount: 0, message: 'Abgebrochen.' })
  }

  const onFile = async (file: File | undefined, mode: 'injected' | 'mediapipe') => {
    if (!file) return
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        const parsed = parseAnnotatedSequence(JSON.parse(await file.text()))
        if ('error' in parsed) {
          setError(parsed.error)
          return
        }
        await runClip(parsed, parsed.frames.some((frame) => frame.pixels) ? mode : 'injected')
      } catch {
        setError('JSON-Annotation unlesbar.')
      }
      return
    }
    const extracted = await extractLocalFileClip(file)
    if ('error' in extracted) {
      setError(extracted.error)
      return
    }
    await runClip(extracted, mode)
  }

  const decision = report ? formatDecisionNote(report) : null

  return (
    <section className="module-slot" data-module="pose-compare">
      <header>
        <p className="kicker">Labor · Lite vs Full</p>
        <h2>{report ? report.decision.verdict : 'Modellvergleich'}</h2>
      </header>
      <p>
        Derselbe Clip durch Lite und Full, nacheinander. Produkt bleibt auf{' '}
        <code>{POSE_MODEL_FILES.lite.versionPath}</code>. Full lädt nur hier.
        Person-Pose bleibt getrennt von B/S/G. Heavy ({POSE_HEAVY_REASON}) ist aus.
        Importierte Pixel gehen byte-identisch an Lite und Full. Synthetic nur auf
        Fixture-Clips. JSON ohne Bilddaten ist Simulation, kein echtes GT.
        Lokal, kein Upload, keine Ampel.
      </p>
      <div className="btn-row">
        <button
          type="button"
          disabled={busy}
          data-action="compare-synthetic-injected"
          onClick={() => void runClip(syntheticCompareClip(24), 'injected')}
        >
          Synthetic-Clip
        </button>
        <button
          type="button"
          disabled={busy}
          data-action="compare-file-fixture"
          onClick={() => void runClip(fileFixtureCompareClip(), 'injected')}
        >
          File-Fixture
        </button>
        <button
          type="button"
          disabled={busy}
          data-action="compare-synthetic-mediapipe"
          onClick={() => void runClip(syntheticCompareClip(12), 'mediapipe')}
        >
          MediaPipe auf Clip
        </button>
        <label className="file-btn">
          Datei lokal
          <input
            type="file"
            accept={`${FILE_ACCEPT},.json`}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void onFile(file, 'mediapipe')
            }}
          />
        </label>
        <button type="button" disabled={!busy} data-action="compare-abort" onClick={abort}>
          Abbrechen
        </button>
        <button type="button" disabled data-action="compare-heavy">
          Heavy (später)
        </button>
      </div>
      {progress.phase !== 'idle' && (
        <p className="status-idle" data-compare-progress>
          {progress.phase}
          {progress.model ? ` · ${progress.model}` : ''}
          {progress.frameCount > 0 ? ` · ${progress.frameIndex}/${progress.frameCount}` : ''}
          {progress.message ? ` — ${progress.message}` : ''}
        </p>
      )}
      {error && (
        <p className="lost-banner" data-compare-error>
          {error}
        </p>
      )}
      {report && (
        <>
          {report.clip.simulation && (
            <p className="status-idle" data-compare-simulation>
              Simulation — Fixture oder Landmarks ohne Bilddaten. Kein echtes Ground-Truth-Modellvergleich.
            </p>
          )}
          <dl className="readout compact" data-compare-stats>
            <div>
              <dt>Lite</dt>
              <dd>
                {report.lite.versionPath} · init {fmtMs(report.lite.initMs)}
              </dd>
            </div>
            <div>
              <dt>Full</dt>
              <dd>
                {report.full.versionPath} · init {fmtMs(report.full.initMs)}
              </dd>
            </div>
            <div>
              <dt>Runtime p50/p95</dt>
              <dd>
                L {fmtMs(report.lite.inference.p50)}/{fmtMs(report.lite.inference.p95)} · F{' '}
                {fmtMs(report.full.inference.p50)}/{fmtMs(report.full.inference.p95)}
              </dd>
            </div>
            <div>
              <dt>Lost frames</dt>
              <dd>
                L {report.lite.lostFrames}/{report.lite.frames} · F {report.full.lostFrames}/
                {report.full.frames}
              </dd>
            </div>
            <div>
              <dt>Landmark RMSE</dt>
              <dd>
                {report.landmarkError.vsTruth.available
                  ? `GT L ${report.landmarkError.vsTruth.liteRmseNorm?.toFixed(4) ?? '—'} · F ${report.landmarkError.vsTruth.fullRmseNorm?.toFixed(4) ?? '—'}`
                  : `L↔F ${report.landmarkError.liteVsFull.rmseNorm.toFixed(4)}`}
              </dd>
            </div>
            <div>
              <dt>Winkel Δ</dt>
              <dd>
                Knie {fmtDeg(report.angleDeltas.kneeFlexion.meanAbsDeg)} · Rumpf{' '}
                {fmtDeg(report.angleDeltas.trunkTorso.meanAbsDeg)} · Ellbogen{' '}
                {fmtDeg(report.angleDeltas.elbowFlexion.meanAbsDeg)}
              </dd>
            </div>
          </dl>
          <pre className="compare-note" data-compare-decision>
            {decision}
          </pre>
        </>
      )}
    </section>
  )
}
