import { useState } from 'react'
import { applyCameraZoom, cameraZoom } from './zoom.ts'

export function CameraZoomControl({ stream }: { stream: MediaStream | null }) {
  const track = stream?.getVideoTracks()[0] ?? null
  const zoom = cameraZoom(track)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  if (!track) return null

  if (!zoom) {
    return (
      <p className="status-idle" data-camera-zoom="unavailable">
        Für diese Kamera meldet der Browser keinen Zoom. Am Mac: Menüleiste → Video → Center Stage aus → im Vorschaubild 0,5× wählen (falls verfügbar). Sonst das iPhone weiter vom Rad wegstellen.
      </p>
    )
  }

  const current = selected ?? zoom.current
  const presets = [0.5, 1, 1.5, 2, 3].filter((value) => value >= zoom.min && value <= zoom.max)
  if (current !== null && !presets.some((value) => Math.abs(value - current) < 0.01)) presets.push(current)
  presets.sort((a, b) => a - b)

  const choose = async (value: number) => {
    if (!track || pending) return
    setPending(true)
    setError(null)
    try {
      setSelected(await applyCameraZoom(track, value))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Zoom konnte nicht geändert werden.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="field" data-camera-zoom="available">
      <label htmlFor="camera-zoom">Kamera-Zoom</label>
      <select
        id="camera-zoom"
        value={current ?? ''}
        disabled={pending}
        onChange={(event) => void choose(Number(event.target.value))}
      >
        {current === null && <option value="">Zoom wählen</option>}
        {presets.map((value) => <option key={value} value={value}>{value.toLocaleString('de-DE')}×</option>)}
      </select>
      <p className="status-idle">
        {zoom.min <= 0.5 ? '0,5× erweitert das Kamerabild; danach müssen Hüfte, Knie und Knöchel im Bild bleiben.' : `0,5× ist im Browser nicht verfügbar (Bereich ${zoom.min.toLocaleString('de-DE')}–${zoom.max.toLocaleString('de-DE')}×). Am Mac: Menüleiste → Video → Center Stage aus → 0,5×, oder iPhone weiter weg.`}
      </p>
      {error && <p className="lost-banner" role="alert">{error}</p>}
    </div>
  )
}
