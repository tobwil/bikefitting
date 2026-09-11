import type { PixelPoint } from '../types/calibration.ts'
import type { PerspectiveCondition, PlaneScale, ScalePlaceTarget, ScalePurpose, ScaleUnit } from '../types/scale.ts'
import { scaleIsConfirmed } from './plane.ts'
import './scale.css'

export type ScaleDraftState = {
  purpose: ScalePurpose
  measuredValue: string
  unit: ScaleUnit
  perspective: PerspectiveCondition
  uncertainty: string
  checkValue: string
  checkUnit: ScaleUnit
  a: PixelPoint | null
  b: PixelPoint | null
  checkA: PixelPoint | null
  checkB: PixelPoint | null
}

export const EMPTY_SCALE_DRAFT: ScaleDraftState = {
  purpose: 'length_in_plane',
  measuredValue: '',
  unit: 'mm',
  perspective: 'side_view_ok',
  uncertainty: '',
  checkValue: '',
  checkUnit: 'mm',
  a: null,
  b: null,
  checkA: null,
  checkB: null,
}

export type ScalePanelProps = {
  scale: PlaneScale
  draft: ScaleDraftState
  placing: ScalePlaceTarget | null
  onDraft: (patch: Partial<ScaleDraftState>) => void
  onPlace: (target: ScalePlaceTarget) => void
  onStoreDraft: () => void
  onCheck: () => void
  onClear: () => void
  message?: string | null
}

function fmtPoint(p: PixelPoint | null): string {
  return p ? `${p.x.toFixed(0)} / ${p.y.toFixed(0)}` : '—'
}

export function ScalePanel({
  scale,
  draft,
  placing,
  onDraft,
  onPlace,
  onStoreDraft,
  onCheck,
  onClear,
  message,
}: ScalePanelProps) {
  const confirmed = scaleIsConfirmed(scale)
  return (
    <section className="module-slot scale-panel" data-module="scale" data-scale-status={scale.status}>
      <header>
        <p className="kicker">Maßstab · Bildebene</p>
        <h2>{confirmed ? 'Maßstab geprüft' : 'Gemessene Referenz setzen'}</h2>
      </header>
      <div className="scale-limits">
        <p>Nutzerdefiniertes Maß in der relevanten Bildebene. Kein Standard-Raddurchmesser.</p>
        <p>Bildabstände sind kein Sattelmaß in mm. Stack/Reach brauchen eigene Bezüge — S/G reichen nicht.</p>
        <p>Längenangaben erst nach unabhängiger Prüfung. Kein Millimeter-Produktversprechen.</p>
      </div>
      <div className="scale-grid">
        <div className="scale-field">
          <label htmlFor="scale-purpose">Zweck</label>
          <select
            id="scale-purpose"
            value={draft.purpose}
            onChange={(event) => onDraft({ purpose: event.target.value as ScalePurpose })}
          >
            <option value="length_in_plane">Länge in der Bildebene</option>
            <option value="frame_stack">Rahmen-Stack (eigener Bezug)</option>
            <option value="frame_reach">Rahmen-Reach (eigener Bezug)</option>
          </select>
        </div>
        <div className="scale-field">
          <label htmlFor="scale-perspective">Perspektive</label>
          <select
            id="scale-perspective"
            value={draft.perspective}
            onChange={(event) => onDraft({ perspective: event.target.value as PerspectiveCondition })}
          >
            <option value="side_view_ok">Seitenansicht ok</option>
            <option value="oblique">schräg</option>
            <option value="unknown">unbekannt</option>
          </select>
        </div>
        <div className="scale-field">
          <label htmlFor="scale-value">Gemessenes Maß</label>
          <input
            id="scale-value"
            inputMode="decimal"
            value={draft.measuredValue}
            onChange={(event) => onDraft({ measuredValue: event.target.value })}
            placeholder="z. B. 100"
          />
        </div>
        <div className="scale-field">
          <label htmlFor="scale-unit">Einheit</label>
          <select
            id="scale-unit"
            value={draft.unit}
            onChange={(event) => onDraft({ unit: event.target.value as ScaleUnit })}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
        <div className="scale-field">
          <label htmlFor="scale-uncertainty">Unsicherheit</label>
          <input
            id="scale-uncertainty"
            inputMode="decimal"
            value={draft.uncertainty}
            onChange={(event) => onDraft({ uncertainty: event.target.value })}
            placeholder="z. B. 2"
          />
        </div>
        <div className="scale-field">
          <label>Bezugspunkte</label>
          <div className="scale-points">
            <button
              type="button"
              className={placing === 'refA' ? 'is-placing' : undefined}
              data-action="scale-place-a"
              onClick={() => onPlace('refA')}
            >
              A {fmtPoint(draft.a)}
            </button>
            <button
              type="button"
              className={placing === 'refB' ? 'is-placing' : undefined}
              data-action="scale-place-b"
              onClick={() => onPlace('refB')}
            >
              B {fmtPoint(draft.b)}
            </button>
          </div>
        </div>
        <div className="scale-field">
          <label htmlFor="scale-check-value">Unabhängige Prüflänge</label>
          <input
            id="scale-check-value"
            inputMode="decimal"
            value={draft.checkValue}
            onChange={(event) => onDraft({ checkValue: event.target.value })}
            placeholder="zweites bekanntes Maß"
          />
        </div>
        <div className="scale-field">
          <label htmlFor="scale-check-unit">Prüfeinheit</label>
          <select
            id="scale-check-unit"
            value={draft.checkUnit}
            onChange={(event) => onDraft({ checkUnit: event.target.value as ScaleUnit })}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="in">in</option>
          </select>
        </div>
        <div className="scale-field is-wide">
          <label>Prüfpunkte (zweite bekannte Länge)</label>
          <div className="scale-points">
            <button
              type="button"
              className={placing === 'checkA' ? 'is-placing' : undefined}
              data-action="scale-place-check-a"
              onClick={() => onPlace('checkA')}
            >
              C {fmtPoint(draft.checkA)}
            </button>
            <button
              type="button"
              className={placing === 'checkB' ? 'is-placing' : undefined}
              data-action="scale-place-check-b"
              onClick={() => onPlace('checkB')}
            >
              D {fmtPoint(draft.checkB)}
            </button>
          </div>
        </div>
      </div>
      <div className="btn-row">
        <button type="button" data-action="scale-store" onClick={onStoreDraft}>
          Entwurf speichern
        </button>
        <button type="button" className="is-active" data-action="scale-check" onClick={onCheck}>
          Unabhängig prüfen
        </button>
        <button type="button" data-action="scale-clear" onClick={onClear}>
          Maßstab löschen
        </button>
      </div>
      <p className="scale-status" data-scale-status={scale.status} data-scale-confirmed={confirmed ? 'true' : 'false'}>
        {scale.status === 'checked'
          ? 'Bestätigt gegen unabhängige Länge. Keine mm-Produktzusage.'
          : scale.status === 'failed_check'
            ? 'Prüfung fehlgeschlagen — Längenangaben aus.'
            : scale.status === 'draft'
              ? 'Entwurf ohne Bestätigung.'
              : 'Kein Maßstab.'}
      </p>
      {message && <p className="status-idle">{message}</p>}
      <ul className="scale-notes">
        {scale.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  )
}
