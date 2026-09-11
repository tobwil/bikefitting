import { useMemo, useState } from 'react'
import { PHASE_IDS, PHASE_TARGET_DEG, type PhaseId, type PhaseSlot } from '../../types/phase.ts'
import type { MeasurementResult } from '../../types/result.ts'
import type { SavedSession } from '../types.ts'
import { PHASE_LABEL_DE } from '../../metrics/phaseFrames.ts'
import { comparePhaseResults, type PhaseComparison } from '../../sessions/compare.ts'

function slotCaption(slot: PhaseSlot): string {
  if (slot.status === 'missing') return 'Kein Frame im Kurbelfenster'
  if (slot.status === 'deleted') return 'Bild gelöscht — Messwerte bleiben'
  const frame = slot.frame
  if (!frame) return 'Kein Frame im Kurbelfenster'
  const knee =
    frame.frameMetrics.kneeFlexionDeg !== null
      ? `Knie ${frame.frameMetrics.kneeFlexionDeg.toFixed(1)}°`
      : 'Knie —'
  return `Einzelbild · Kurbel ${frame.crankAngleDeg.toFixed(1)}° · ${knee}`
}

function SlotCard({ slot, stamp }: { slot: PhaseSlot; stamp?: string }) {
  const frame = slot.frame
  const image = slot.status === 'captured' ? frame?.image : null
  return (
    <figure className="phase-slot" data-phase={slot.id} data-status={slot.status}>
      <div className="phase-slot-frame">
        {image ? (
          <img src={image.dataUrl} alt={`${PHASE_LABEL_DE[slot.id]} ${slot.targetDeg}°`} />
        ) : (
          <div className="phase-missing" data-phase-missing={slot.id}>
            <span>{slot.status === 'deleted' ? 'Gelöscht' : 'Fehlt'}</span>
            <small>
              {slot.status === 'missing'
                ? 'Kein Treffer im Kurbelfenster — kein Ersatzextremum.'
                : 'Freiwillig entfernt.'}
            </small>
          </div>
        )}
      </div>
      <figcaption>
        <strong>
          {PHASE_LABEL_DE[slot.id]}
          <span> {slot.targetDeg}°</span>
        </strong>
        <em>{slotCaption(slot)}</em>
        {stamp ? <span className="phase-stamp">{stamp}</span> : null}
      </figcaption>
    </figure>
  )
}

export function PhaseEvidencePanel({
  result,
  sessions,
  currentId,
  currentLabel,
  onDeleteImages,
}: {
  result: MeasurementResult
  sessions: SavedSession[]
  currentId: string
  currentLabel: string
  onDeleteImages: () => void
}) {
  const evidence = result.phaseEvidence
  const [beforeId, setBeforeId] = useState<string>('')
  const others = useMemo(
    () => sessions.filter((row) => row.id !== currentId && row.result.phaseEvidence),
    [sessions, currentId],
  )
  const before = others.find((row) => row.id === beforeId) ?? null
  const comparison: PhaseComparison | null = before
    ? comparePhaseResults(before.result, result, {
        before: before.title,
        after: currentLabel,
      })
    : null

  if (!evidence) {
    return (
      <section className="phase-sheet" data-phase-evidence="none">
        <p className="kicker">Phasenbilder</p>
        <h3>Keine Kurbelphasen</h3>
        <p>Ohne gültige Umdrehung gibt es keine Standbilder. Fehlende Phasen werden nicht durch Extrema ersetzt.</p>
      </section>
    )
  }

  const cycle = evidence.representativeCycle
  const hasStoredImage = evidence.stored && evidence.slots.some((slot) => slot.frame?.image)
  const sideLabel = evidence.side === 'left' ? 'links' : 'rechts'

  return (
    <section className="phase-sheet" data-phase-evidence={evidence.stored ? 'stored' : 'stripped'}>
      <header className="phase-sheet-head">
        <p className="kicker">Phasenbilder · Kurbelwinkel</p>
        <h3>Eine gültige Umdrehung, vier Totpunkte</h3>
        <p>
          Auswahl über gemessenen Kurbelwinkel (±{evidence.windowHalfDeg}°), nicht über Knie-Extrema.
          Die Karten oben sind der <strong>Median über mehrere Umdrehungen</strong>. Die Bilder sind{' '}
          <strong>Einzelbilder</strong>
          {cycle ? ` aus Umdrehung ${cycle.index + 1}` : ''}. Seite {sideLabel}.
        </p>
      </header>

      <div className="phase-clock" aria-hidden="true">
        {PHASE_IDS.map((id) => {
          const slot = evidence.slots.find((item) => item.id === id)
          const deg = PHASE_TARGET_DEG[id]
          return (
            <span
              key={id}
              className={`phase-clock-tick is-${slot?.status ?? 'missing'}`}
              style={{ transform: `rotate(${deg}deg)` }}
              data-phase-tick={id}
            />
          )
        })}
        <span className="phase-clock-hub">B</span>
      </div>

      <div className="phase-grid">
        {evidence.slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            stamp={slot.frame ? `${slot.frame.timestampMs.toFixed(0)} ms` : undefined}
          />
        ))}
      </div>

      <p className="phase-method" data-phase-method={evidence.selectionMethod}>
        Methode {evidence.selectionMethod} · Metrik {evidence.metricMethod} · Kalibrierung v
        {evidence.calibrationVersion}
        {evidence.setupId ? ` · ${evidence.setupId}` : ''}
      </p>

      <div className="phase-actions">
        <button type="button" data-action="print-result" onClick={() => window.print()}>
          Druckansicht
        </button>
        {hasStoredImage ? (
          <button type="button" data-action="delete-phase-images" onClick={onDeleteImages}>
            Bilder löschen
          </button>
        ) : (
          <span className="phase-note">Bilder sind optional. Messwerte bleiben lokal.</span>
        )}
      </div>

      {others.length > 0 && (
        <div className="phase-compare" data-phase-compare>
          <label className="field">
            <span>Vorher / nachher</span>
            <select
              value={beforeId}
              onChange={(event) => setBeforeId(event.target.value)}
              data-action="phase-before"
            >
              <option value="">Messung wählen…</option>
              {others.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title || row.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          {before && comparison && !comparison.compatible && (
            <p className="restricted-banner" data-phase-compare-ok="false">
              Kein Bildvergleich — Quelle, Seite, Methode und Kalibrierung müssen passen (
              {comparison.reasons.join(', ')}).
            </p>
          )}
          {before && comparison?.compatible && (
            <div data-phase-compare-ok="true">
              {comparison.bikeChanged && comparison.bikeNote && (
                <p className="phase-bike-note" data-phase-bike-changed="true">
                  {comparison.bikeNote}
                </p>
              )}
              <div className="phase-compare-grid">
                {PHASE_IDS.map((id: PhaseId) => {
                  const beforeSlot = before.result.phaseEvidence?.slots.find((slot) => slot.id === id)
                  const afterSlot = evidence.slots.find((slot) => slot.id === id)
                  if (!beforeSlot || !afterSlot) return null
                  return (
                    <div key={id} className="phase-compare-pair" data-phase-pair={id}>
                      <SlotCard slot={beforeSlot} stamp="vorher" />
                      <SlotCard slot={afterSlot} stamp="nachher" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
