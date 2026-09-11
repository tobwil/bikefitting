import { isDemoResult, isFileCapture, isSyntheticCapture, type MeasurementResult } from '../../types/result.ts'

export function DemoBanner({ result }: { result: MeasurementResult | null }) {
  if (isDemoResult(result)) {
    return (
      <p className="demo-banner" data-source="demo" data-evaluation="demo">
        Demo-Auswertung — nicht als Produktmessung. Qualität und Produktstand sind getrennte Felder.
      </p>
    )
  }
  if (isSyntheticCapture(result)) {
    return (
      <p className="demo-banner is-synthetic" data-source="synthetic" data-evaluation="standard">
        Synthetische Aufnahme — keine Kameramessung.
      </p>
    )
  }
  if (isFileCapture(result) && result) {
    return (
      <p className="demo-banner is-file" data-source="file" data-evaluation={result.provenance.evaluation}>
        {result.file?.staticCheck
          ? 'Lokales Einzelbild — statische Prüfung, keine Mehrzyklus-Messung. Kein Upload.'
          : 'Lokale Datei — kein Upload. Aufnahme mit der Zeit der Datei.'}
      </p>
    )
  }
  return null
}

function shortId(id: string | null | undefined): string {
  if (!id) return '—'
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('de-DE')
}

/** Snapshot readout — never live profile / live calibration. */
export function ResultProvenance({ result }: { result: MeasurementResult | null }) {
  if (!result) return null
  const cal = result.calibration
  const binding = cal.binding
  const rules =
    result.ruleVersions.length === 0
      ? '—'
      : result.ruleVersions.map((rule) => `${rule.id} ${rule.status}`).join(', ')
  return (
    <div
      className="result-snapshot"
      data-product-release={result.provenance.productRelease}
      data-source={result.source}
      data-measurement-id={result.quality.measurementId ?? result.id}
    >
      <p className="result-provenance">
        Quelle {result.source}
        {' · '}
        Produktstand {result.provenance.productRelease}
        {' · '}
        Aufnahme {result.provenance.capture}
        {' · '}
        Auswertung {result.provenance.evaluation}
      </p>
      <dl className="result-snapshot-meta">
        <div>
          <dt>Messung</dt>
          <dd>{shortId(result.quality.measurementId ?? result.id)}</dd>
        </div>
        <div>
          <dt>Fenster</dt>
          <dd>
            {formatWhen(result.time.startedAt)} → {formatWhen(result.time.endedAt)}
            {result.file
              ? ` · ${result.file.width}×${result.file.height} · ${result.file.mediaTimeRangeMs.start.toFixed(0)}–${result.file.mediaTimeRangeMs.end.toFixed(0)} ms`
              : ''}
          </dd>
        </div>
        <div>
          <dt>Kalibrierung</dt>
          <dd>
            v{cal.version}
            {binding ? ` · ${binding.source} ${binding.setupId}` : ''}
          </dd>
        </div>
        <div>
          <dt>Methode</dt>
          <dd>
            {result.method.metrics}; {result.method.rules}
          </dd>
        </div>
        <div>
          <dt>Profil</dt>
          <dd>
            {result.profile.name} ({result.profile.id}
            {result.profile.productionEnabled ? ', productionEnabled' : ''})
          </dd>
        </div>
        <div>
          <dt>Regelstände</dt>
          <dd>{rules}</dd>
        </div>
      </dl>
    </div>
  )
}

export function StorageErrorNotice({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="storage-error" data-storage-error role="alert">
      {message}
    </p>
  )
}

export function DemoPill({ result }: { result: MeasurementResult | null }) {
  if (isDemoResult(result)) {
    return (
      <span className="demo-pill" data-source="demo">
        Demo
      </span>
    )
  }
  if (isSyntheticCapture(result)) {
    return (
      <span className="demo-pill is-synthetic" data-source="synthetic">
        Synthetisch
      </span>
    )
  }
  if (isFileCapture(result)) {
    return (
      <span className="demo-pill is-file" data-source="file">
        Datei
      </span>
    )
  }
  return null
}
