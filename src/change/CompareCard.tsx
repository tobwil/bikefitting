import type { ChangeComparison } from '../types/change.ts'
import { CHANGE_COPY, directionLabel } from './copy.ts'

function formatDeg(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}°`
}

export function CompareCard({ comparison }: { comparison: ChangeComparison }) {
  const flags = comparison.compatibility
  return (
    <section
      className="outcome-card change-compare"
      data-change-compare
      data-verdict={comparison.verdict}
      data-comparable={comparison.comparable ? 'true' : 'false'}
      data-method={comparison.method ?? ''}
      data-method-version={comparison.methodVersion ?? ''}
      data-compat-method={flags.method ? 'true' : 'false'}
      data-compat-profile={flags.profile ? 'true' : 'false'}
      data-compat-setup={flags.setup ? 'true' : 'false'}
      data-compat-camera={flags.camera ? 'true' : 'false'}
      data-compat-lens={flags.lens ? 'true' : 'false'}
    >
      <p className="kicker">Vorher / Nachher</p>
      <p className="outcome-kind" data-compare-verdict>
        {comparison.verdict === 'no_secure_change'
          ? 'Wiederholung'
          : comparison.verdict === 'not_comparable'
            ? 'Nicht vergleichbar'
            : 'Gleiche Methode'}
      </p>
      <h2 data-compare-headline>{comparison.headline}</h2>
      <p className="outcome-how" data-compare-detail>
        {comparison.detail}
      </p>
      <dl className="change-metrics">
        <div>
          <dt>Metrik</dt>
          <dd data-compare-metric>Kniebeugung</dd>
        </div>
        <div>
          <dt>Methode</dt>
          <dd data-compare-method>
            {comparison.method ?? 'verschieden'}
            {comparison.methodVersion ? ` · ${comparison.methodVersion}` : ''}
          </dd>
        </div>
        <div>
          <dt>Vorher</dt>
          <dd data-compare-before>{formatDeg(comparison.beforeDeg)}</dd>
        </div>
        <div>
          <dt>Nachher</dt>
          <dd data-compare-after>{formatDeg(comparison.afterDeg)}</dd>
        </div>
        <div>
          <dt>Differenz</dt>
          <dd data-compare-delta>
            {comparison.deltaDeg == null
              ? '—'
              : `${comparison.deltaDeg > 0 ? '+' : ''}${comparison.deltaDeg.toFixed(1)}°`}
          </dd>
        </div>
        <div>
          <dt>Dokumentiert</dt>
          <dd data-compare-change>
            {directionLabel(comparison.documentedChange.direction)}
            {comparison.documentedChange.noteOld || comparison.documentedChange.noteNew
              ? ` · ${comparison.documentedChange.noteOld ?? '—'} → ${comparison.documentedChange.noteNew ?? '—'}`
              : ''}
          </dd>
        </div>
      </dl>
      <ul className="change-flags">
        <li data-flag-method={flags.method ? 'ok' : 'no'}>Methode {flags.method ? 'gleich' : 'anders'}</li>
        <li data-flag-profile={flags.profile ? 'ok' : 'no'}>Profil {flags.profile ? 'gleich' : 'anders'}</li>
        <li data-flag-setup={flags.setup ? 'ok' : 'no'}>Setup {flags.setup ? 'gleich' : 'anders'}</li>
        <li data-flag-camera={flags.camera ? 'ok' : 'no'}>Kamera {flags.camera ? 'gleich' : 'geändert'}</li>
      </ul>
      {comparison.targetBandNote && (
        <p className="change-target-note" data-target-band-note>
          {comparison.targetBandNote}
        </p>
      )}
      {!comparison.comparable && <p className="reco-release">{CHANGE_COPY.cameraNotBody}</p>}
    </section>
  )
}
