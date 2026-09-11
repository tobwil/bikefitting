import type { DetectViewQuality, PointStatus } from '../types/calibration.ts'

export function pointStatusLabel(status: PointStatus): string {
  if (status === 'proposed') return 'vorgeschlagen'
  if (status === 'confirmed') return 'bestätigt'
  if (status === 'corrected') return 'korrigiert'
  return 'unklar'
}

export function viewQualityLabel(quality: DetectViewQuality): string {
  if (quality === 'ok') return 'Seitenansicht brauchbar'
  if (quality === 'bad_perspective') return 'Perspektive ungeeignet'
  if (quality === 'occluded') return 'Punkt verdeckt'
  if (quality === 'ambiguous') return 'Punkte unklar'
  if (quality === 'multiple') return 'Mehrere Fahrräder'
  return 'Kein Fahrrad'
}
