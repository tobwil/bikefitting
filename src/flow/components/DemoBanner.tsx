import { isDemoResult, type MeasurementResult } from '../../types/result.ts'

export function DemoBanner({ result }: { result: MeasurementResult | null }) {
  if (!isDemoResult(result)) return null
  return (
    <p className="demo-banner" data-source="demo" data-evaluation="demo">
      Demo-Auswertung — nicht als Produktmessung. Qualität und Produktstand sind getrennte Felder.
    </p>
  )
}

export function ResultProvenance({ result }: { result: MeasurementResult | null }) {
  if (!result) return null
  return (
    <p className="result-provenance" data-product-release={result.provenance.productRelease}>
      Produktstand {result.provenance.productRelease}
      {' · '}
      Aufnahme {result.provenance.capture}
      {' · '}
      Auswertung {result.provenance.evaluation}
      {' · '}
      Kalibrierung v{result.calibration.version}
    </p>
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
  if (!isDemoResult(result)) return null
  return (
    <span className="demo-pill" data-source="demo">
      Demo
    </span>
  )
}
