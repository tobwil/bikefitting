import type { FilePlaybackSnapshot, SourceTransform } from '../types/file.ts'
import { IDENTITY_SOURCE_TRANSFORM, insetCrop } from './frameTransform.ts'

export type ReplayBarProps = {
  playback: FilePlaybackSnapshot
  transform: SourceTransform
  staticCheck: boolean
  disabled?: boolean
  onPlay: () => void
  onPause: () => void
  onRestart: () => void
  onSeek: (timeSec: number) => void
  onStep: (direction: -1 | 1) => void
  onRotate: () => void
  onCrop: (crop: SourceTransform['crop']) => void
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function ReplayBar({
  playback,
  transform,
  staticCheck,
  disabled,
  onPlay,
  onPause,
  onRestart,
  onSeek,
  onStep,
  onRotate,
  onCrop,
}: ReplayBarProps) {
  const durationSec = playback.durationMs / 1000
  const currentSec = playback.currentTimeMs / 1000
  return (
    <div className="replay-bar" data-replay="file" data-static-check={staticCheck ? 'true' : 'false'} data-upload="false">
      <div className="btn-row">
        {playback.paused ? (
          <button type="button" disabled={disabled || staticCheck} onClick={onPlay}>
            Abspielen
          </button>
        ) : (
          <button type="button" disabled={disabled} onClick={onPause}>
            Pause
          </button>
        )}
        <button type="button" disabled={disabled || staticCheck} onClick={() => onStep(-1)}>
          −1
        </button>
        <button type="button" disabled={disabled || staticCheck} onClick={() => onStep(1)}>
          +1
        </button>
        <button type="button" disabled={disabled} onClick={onRestart}>
          Von vorn
        </button>
        <button type="button" disabled={disabled} onClick={onRotate}>
          Drehen {transform.rotation}°
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onCrop(transform.crop ? null : insetCrop(0.1))}
        >
          {transform.crop ? 'Zuschnitt aus' : 'Zuschnitt'}
        </button>
      </div>
      {!staticCheck && (
        <label className="field replay-seek">
          <span>
            {formatMs(playback.currentTimeMs)} / {formatMs(playback.durationMs)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0.001, durationSec)}
            step={1 / 30}
            value={Math.min(currentSec, durationSec || 0)}
            disabled={disabled || durationSec <= 0}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label="Abspielposition"
          />
        </label>
      )}
      <p className="status-idle">
        {staticCheck
          ? 'Einzelbild — statische Prüfung, keine Mehrzyklus-Messung. Bleibt lokal, kein Upload.'
          : 'Videozeit der Datei. Pause und Sprung setzen Tracker zurück. Bleibt lokal, kein Upload.'}
      </p>
    </div>
  )
}

export const DEFAULT_REPLAY_TRANSFORM = IDENTITY_SOURCE_TRANSFORM
