import { cameraZoom } from './zoom.ts'

/** External macOS/Continuity zoom can change the track setting without our UI. */
export function zoomSettingDrifted(track: MediaStreamTrack | null, lastKnown: number | null, slack = 0.08): boolean {
  if (lastKnown == null || !Number.isFinite(lastKnown)) return false
  const current = cameraZoom(track)?.current
  if (current == null || !Number.isFinite(current)) return false
  return Math.abs(current - lastKnown) > slack
}
