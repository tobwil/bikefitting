import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  HAND_POSITIONS,
  METRIC_KEYS,
  type HandPosition,
  type MeasurementSession,
  type SessionBackendKind,
} from '../types/session.ts'
import { compareSessions } from './compare.ts'
import { downloadText } from './download.ts'
import {
  comparisonToMarkdown,
  formatMetricValue,
  metricLabel,
  sessionFilename,
  sessionToJson,
  sessionToMarkdown,
  sessionsExportFilename,
  sessionsToExportJson,
} from './export.ts'
import { parseImportJson } from './import.ts'
import { runSessionsHarness, type SessionsHarnessResult } from './harness.ts'
import { buildSession, type LiveFitInput } from './snapshot.ts'
import { getSessionBackend, type SessionBackend } from './storage.ts'

export type SessionsLiveProps = Omit<LiveFitInput, 'bike' | 'side' | 'handPosition' | 'label'>

export type SessionsPanelProps = {
  live?: SessionsLiveProps
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

function sessionTitle(session: MeasurementSession): string {
  const name = session.label.trim() || session.conditions.bike.trim() || shortId(session.id)
  return `${name} · ${session.conditions.handPosition} · ${session.conditions.side}`
}

export function SessionsPanel({ live }: SessionsPanelProps) {
  const [backend, setBackend] = useState<SessionBackend | null>(null)
  const [backendKind, setBackendKind] = useState<SessionBackendKind | '…'>('…')
  const [sessions, setSessions] = useState<MeasurementSession[]>([])
  const [bike, setBike] = useState('Test bike')
  const [side, setSide] = useState<'left' | 'right'>('right')
  const [handPosition, setHandPosition] = useState<HandPosition>('hoods')
  const [label, setLabel] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [harness, setHarness] = useState<SessionsHarnessResult | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async (store: SessionBackend) => {
    const rows = await store.list()
    setSessions(rows)
    setSelectedId((id) => (id && rows.some((s) => s.id === id) ? id : rows[0]?.id ?? null))
    setBeforeId((id) => (id && rows.some((s) => s.id === id) ? id : null))
    setAfterId((id) => (id && rows.some((s) => s.id === id) ? id : null))
  }, [])

  useEffect(() => {
    let cancelled = false
    void getSessionBackend()
      .then(async (store) => {
        if (cancelled) return
        setBackend(store)
        setBackendKind(store.kind)
        await reload(store)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Session store failed to open.')
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const selected = sessions.find((s) => s.id === selectedId) ?? null
  const before = sessions.find((s) => s.id === beforeId) ?? null
  const after = sessions.find((s) => s.id === afterId) ?? null
  const comparison = before && after && before.id !== after.id ? compareSessions(before, after) : null

  const liveReady = live?.quality.calibrationReady ? 'cal ready' : 'cal —'

  const saveCurrent = async () => {
    if (!backend) return
    if (bike.trim() === '') {
      setError('Bike name is required to save a session.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const session = buildSession({
        bike,
        side,
        handPosition,
        label,
        calibrationVersion: live?.calibrationVersion,
        metrics: live?.metrics ?? {
          kneeFlexionDeg: null,
          crankAngleDeg: null,
          pedalPhase01: null,
          pedalRevolutions: 0,
          inferenceMs: null,
        },
        quality: live?.quality ?? {
          landmarkVisibility: null,
          poseEngine: 'none',
          frameSync: 'none',
          pedalStatus: 'none',
          calibrationReady: false,
        },
      })
      await backend.put(session)
      await reload(backend)
      setSelectedId(session.id)
      setNote(`Saved ${sessionTitle(session)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const deleteSelected = async () => {
    if (!backend || !selected) return
    setBusy(true)
    setError(null)
    try {
      await backend.delete(selected.id)
      await reload(backend)
      setNote(`Deleted ${shortId(selected.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    if (!backend || sessions.length === 0) return
    if (!window.confirm(`Clear all ${sessions.length} local sessions? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await backend.clear()
      await reload(backend)
      setNote('Cleared all sessions')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed.')
    } finally {
      setBusy(false)
    }
  }

  const exportSelected = (format: 'json' | 'md') => {
    if (!selected) {
      setError('Select a session to export.')
      return
    }
    const body = format === 'json' ? sessionToJson(selected) : sessionToMarkdown(selected)
    const mime = format === 'json' ? 'application/json' : 'text/markdown'
    downloadText(sessionFilename(selected, format), body, mime)
    setNote(`Downloaded ${format.toUpperCase()} for ${shortId(selected.id)}`)
  }

  const exportAllJson = () => {
    downloadText(sessionsExportFilename('json'), sessionsToExportJson(sessions), 'application/json')
    setNote(`Downloaded JSON bundle (${sessions.length})`)
  }

  const exportComparison = () => {
    if (!before || !after || !comparison) {
      setError('Pick two different sessions as before and after.')
      return
    }
    downloadText(
      `bikefit-compare-${shortId(before.id)}-${shortId(after.id)}.md`,
      comparisonToMarkdown(before, after, comparison),
      'text/markdown',
    )
    setNote('Downloaded comparison Markdown')
  }

  const onImportFile = async (file: File | undefined) => {
    if (!backend || !file) return
    setBusy(true)
    setError(null)
    try {
      const raw = await file.text()
      const result = parseImportJson(raw)
      if (!result.ok) {
        setError(result.error ?? 'Import rejected.')
        return
      }
      for (const session of result.sessions) {
        await backend.put(session)
      }
      await reload(backend)
      const skipped = result.rejected.length
      setNote(
        skipped > 0
          ? `Imported ${result.sessions.length}, rejected ${skipped} corrupt row(s)`
          : `Imported ${result.sessions.length} session(s)`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const runHarness = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await runSessionsHarness()
      setHarness(result)
      setNote(result.message)
      if (!result.passed) setError(result.message)
    } finally {
      setBusy(false)
    }
  }

  const heading = useMemo(() => {
    if (sessions.length === 0) return 'No sessions yet'
    return `${sessions.length} local session${sessions.length === 1 ? '' : 's'}`
  }, [sessions.length])

  return (
    <section className="module-slot" data-module="sessions" data-backend={backendKind} data-session-count={sessions.length}>
      <header>
        <p className="kicker">Sessions · E7 · {backendKind}</p>
        <h2>{heading}</h2>
      </header>
      <p>
        Structured measurements stay on this machine (IndexedDB, localStorage fallback).
        Export Markdown or JSON as a download — no video, no cloud. Numeric metrics only.
      </p>

      <label className="field">
        <span>Bike</span>
        <input
          type="text"
          value={bike}
          onChange={(event) => setBike(event.target.value)}
          placeholder="Bike name"
        />
      </label>
      <label className="field">
        <span>Label (optional)</span>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="baseline / after wedge"
        />
      </label>
      <div className="btn-row">
        <label className="field inline">
          <span>Side</span>
          <select value={side} onChange={(event) => setSide(event.target.value === 'left' ? 'left' : 'right')}>
            <option value="right">right</option>
            <option value="left">left</option>
          </select>
        </label>
        <label className="field inline">
          <span>Hands</span>
          <select
            value={handPosition}
            onChange={(event) => setHandPosition(event.target.value as HandPosition)}
          >
            {HAND_POSITIONS.map((pos) => (
              <option key={pos} value={pos}>
                {pos}
              </option>
            ))}
          </select>
        </label>
      </div>

      <dl className="readout compact">
        <div>
          <dt>Live snapshot</dt>
          <dd>
            {liveReady}
            {live?.metrics.kneeFlexionDeg !== null && live?.metrics.kneeFlexionDeg !== undefined
              ? ` · knee ${live.metrics.kneeFlexionDeg.toFixed(1)}°`
              : ' · knee —'}
          </dd>
        </div>
        <div>
          <dt>Store</dt>
          <dd>{backendKind}</dd>
        </div>
      </dl>

      <div className="btn-row">
        <button type="button" disabled={busy || !backend} onClick={() => void saveCurrent()}>
          Save session
        </button>
        <button type="button" disabled={busy || !selected} onClick={() => exportSelected('json')}>
          Export JSON
        </button>
        <button type="button" disabled={busy || !selected} onClick={() => exportSelected('md')}>
          Export MD
        </button>
        <button type="button" disabled={busy || sessions.length === 0} onClick={exportAllJson}>
          Export all JSON
        </button>
      </div>
      <div className="btn-row">
        <button type="button" disabled={busy || !selected} onClick={() => void deleteSelected()}>
          Delete
        </button>
        <button type="button" disabled={busy || sessions.length === 0} onClick={() => void clearAll()}>
          Clear all
        </button>
        <label className="file-btn">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy || !backend}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              void onImportFile(file)
            }}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void runHarness()}>
          Sessions harness
        </button>
      </div>

      {sessions.length > 0 && (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className={session.id === selectedId ? 'is-selected' : undefined}>
              <button type="button" className="session-pick" onClick={() => setSelectedId(session.id)}>
                <strong>
                  {sessionTitle(session)}
                  {session.result?.provenance.evaluation === 'demo' ? ' · Demo' : ''}
                </strong>
                <span>{session.capturedAt.replace('T', ' ').slice(0, 19)}</span>
              </button>
              <span className="session-actions">
                <button
                  type="button"
                  className={session.id === beforeId ? 'is-active' : undefined}
                  onClick={() => setBeforeId(session.id)}
                >
                  Before
                </button>
                <button
                  type="button"
                  className={session.id === afterId ? 'is-active' : undefined}
                  onClick={() => setAfterId(session.id)}
                >
                  After
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {comparison && before && after && (
        <div className="session-compare" data-restricted={comparison.restricted ? 'true' : 'false'}>
          <p className={comparison.restricted ? 'restricted-banner' : 'ok-note'}>
            {comparison.restricted
              ? `Comparison restricted — conditions differ (${comparison.restrictedReasons.join(', ')}). Deltas are not like-for-like.`
              : 'Same bike, side, hand position, and calibration version.'}
          </p>
          <dl className="readout compact">
            {METRIC_KEYS.map((key) => {
              const delta = comparison.deltas[key]
              return (
                <div key={key}>
                  <dt>{metricLabel(key)}</dt>
                  <dd>
                    {formatMetricValue(key, before.metrics[key])} → {formatMetricValue(key, after.metrics[key])}
                    {delta === null ? '' : ` (${delta > 0 ? '+' : ''}${formatMetricValue(key, delta)})`}
                  </dd>
                </div>
              )
            })}
          </dl>
          <div className="btn-row">
            <button type="button" onClick={exportComparison}>
              Export comparison MD
            </button>
          </div>
        </div>
      )}

      {note && <p className="ok-note">{note}</p>}
      {error && <p className="status-idle">{error}</p>}
      {backendKind === 'memory' && (
        <p className="status-idle">In-memory only this tab — export JSON if you need a copy.</p>
      )}
      {harness && (
        <p className={harness.passed ? 'ok-note' : 'status-idle'}>{harness.message}</p>
      )}
    </section>
  )
}
