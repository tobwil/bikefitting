import { cornerLumaSignature, cornerSignaturesDiffer } from './sceneChange.ts'
import { cameraZoom } from './zoom.ts'
import { zoomSettingDrifted } from './zoomDrift.ts'

/** Poll the live video track for Continuity / macOS zoom that bypasses our UI. */
export const LIVE_GEOMETRY_ZOOM_MS = 700
/** Sample corner luma on live camera frames. Uncertain — not an automatic zoom. */
export const LIVE_GEOMETRY_SCENE_MS = 900
export const SCENE_HINT_SAMPLES = 2

export type GeometryWatchVerdict =
  | { kind: 'stable' }
  | { kind: 'confident'; reason: 'external_zoom' }
  | { kind: 'uncertain'; reason: 'scene_signature' }

export function geometryWatchAction(verdict: GeometryWatchVerdict): 'none' | 'invalidate' | 'hint' {
  if (verdict.kind === 'confident') return 'invalidate'
  if (verdict.kind === 'uncertain') return 'hint'
  return 'none'
}

export type LiveGeometryWatch = {
  noteAppliedZoom: (zoom: number | null) => void
  observeTrack: (track: MediaStreamTrack | null) => GeometryWatchVerdict
  observeFrame: (image: ImageData) => GeometryWatchVerdict
  resetScene: () => void
  resetForNewStream: () => void
  lastZoom: () => number | null
}

/**
 * Always-live geometry watch for the camera/provider path.
 * Confident zoom-setting drift invalidates measurement geometry.
 * Corner-luma jumps only ask for a framing check — never treated as zoom.
 */
export function createLiveGeometryWatch(): LiveGeometryWatch {
  let lastZoom: number | null = null
  let lastStable: number[] | null = null
  let pendingScene = 0

  return {
    noteAppliedZoom(zoom) {
      lastZoom = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : lastZoom
    },
    observeTrack(track) {
      const current = cameraZoom(track)?.current ?? null
      if (current == null || !Number.isFinite(current)) return { kind: 'stable' }
      if (lastZoom == null) {
        lastZoom = current
        return { kind: 'stable' }
      }
      if (zoomSettingDrifted(track, lastZoom)) {
        lastZoom = current
        return { kind: 'confident', reason: 'external_zoom' }
      }
      return { kind: 'stable' }
    },
    observeFrame(image) {
      const next = cornerLumaSignature(image)
      if (!lastStable) {
        lastStable = next
        pendingScene = 0
        return { kind: 'stable' }
      }
      if (!cornerSignaturesDiffer(lastStable, next)) {
        pendingScene = 0
        lastStable = next
        return { kind: 'stable' }
      }
      pendingScene += 1
      if (pendingScene < SCENE_HINT_SAMPLES) return { kind: 'stable' }
      pendingScene = 0
      lastStable = next
      return { kind: 'uncertain', reason: 'scene_signature' }
    },
    resetScene() {
      lastStable = null
      pendingScene = 0
    },
    resetForNewStream() {
      lastZoom = null
      lastStable = null
      pendingScene = 0
    },
    lastZoom() {
      return lastZoom
    },
  }
}
