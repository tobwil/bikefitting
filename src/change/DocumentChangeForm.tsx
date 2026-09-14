import { useState } from 'react'
import type { ActionDecision } from '../types/action.ts'
import type { ChangeDirection } from '../types/change.ts'
import { CHANGE_COPY, directionLabel } from './copy.ts'
import { documentSourceFor, suggestedDirection } from './document.ts'

export function DocumentChangeForm({
  action,
  onCancel,
  onSubmit,
}: {
  action: ActionDecision | null
  onCancel: () => void
  onSubmit: (input: { direction: ChangeDirection; noteOld: string; noteNew: string }) => void
}) {
  const suggested = suggestedDirection(action)
  const source = documentSourceFor(action)
  const [direction, setDirection] = useState<ChangeDirection | null>(suggested)
  const [noteOld, setNoteOld] = useState('')
  const [noteNew, setNoteNew] = useState('')
  const adjust = source === 'action_adjust'

  return (
    <section className="outcome-card change-document" data-change-document data-document-source={source}>
      <p className="kicker">Änderung</p>
      <h2>{CHANGE_COPY.documentTitle}</h2>
      <p className="outcome-how">{adjust ? CHANGE_COPY.documentHintAdjust : CHANGE_COPY.documentHintUser}</p>
      <fieldset className="change-directions">
        <legend>Was wurde geändert?</legend>
        {(['higher', 'lower'] as const).map((item) => (
          <label key={item} className={direction === item ? 'is-selected' : undefined}>
            <input
              type="radio"
              name="change-direction"
              value={item}
              checked={direction === item}
              onChange={() => setDirection(item)}
            />
            {directionLabel(item)}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>{CHANGE_COPY.noteOldLabel}</span>
        <input
          type="text"
          value={noteOld}
          maxLength={240}
          onChange={(event) => setNoteOld(event.target.value)}
          placeholder="z. B. Markierung am Sattel"
        />
      </label>
      <label className="field">
        <span>{CHANGE_COPY.noteNewLabel}</span>
        <input
          type="text"
          value={noteNew}
          maxLength={240}
          onChange={(event) => setNoteNew(event.target.value)}
          placeholder="optional, keine Millimeter nötig"
        />
      </label>
      <button
        type="button"
        className="is-active outcome-primary"
        data-action="recapture-compare"
        disabled={!direction}
        onClick={() => direction && onSubmit({ direction, noteOld, noteNew })}
      >
        {CHANGE_COPY.recapture}
      </button>
      <p className="outcome-primary-hint">{CHANGE_COPY.recaptureHint}</p>
      <button type="button" className="text-link" data-action="cancel-document" onClick={onCancel}>
        {CHANGE_COPY.cancel}
      </button>
    </section>
  )
}
