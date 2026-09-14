import { useCallback, useLayoutEffect } from 'react'
import { stillCanvasVisible } from '../flow/navPolicy.ts'
import { useOptionalFlow } from '../flow/FlowProvider.tsx'
import { ReplayBar } from '../file/ReplayBar.tsx'
import { useFit } from './FitSession.tsx'

export function Stage({ emptyHint }: { emptyHint?: string } = {}) {
  const {
    attachVideo,
    attachOverlay,
    attachStill,
    camera,
    onStageClick,
    pose,
    stageClickMode,
    setStageMounted,
    calibration,
  } = useFit()
  const flow = useOptionalFlow()
  const showStill = stillCanvasVisible({
    frozen: calibration.frozen,
    step: flow?.step ?? 'calibrate',
    mode: flow?.mode ?? 'lab',
  })
  const live =
    camera.status.permission === 'granted' &&
    (Boolean(camera.stream) || camera.status.source === 'file')
  const playable = camera.playback.playable
  const overlayClass =
    stageClickMode === 'off'
      ? 'stage-overlay is-passive'
      : stageClickMode === 'pedal'
        ? 'stage-overlay is-pedal'
        : 'stage-overlay'

  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      attachVideo(el)
    },
    [attachVideo],
  )
  const overlayRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      attachOverlay(el)
    },
    [attachOverlay],
  )
  const stillRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      attachStill(el)
    },
    [attachStill],
  )

  useLayoutEffect(() => {
    setStageMounted(true)
    return () => setStageMounted(false)
  }, [setStageMounted])

  return (
    <div className="stage-frame">
      <video
        ref={videoRef}
        data-bikefit-source={camera.status.source}
        autoPlay
        playsInline
        muted
        className={live && playable ? 'stage-video' : 'stage-video is-empty'}
      />
      <canvas
        ref={stillRef}
        className={showStill ? 'stage-still' : 'stage-still is-hidden'}
        aria-hidden={!showStill}
        data-still-active={showStill ? 'true' : 'false'}
      />
      <canvas
        ref={overlayRef}
        className={overlayClass}
        aria-label="Ist- und Soll-Overlay"
        onClick={(event) => {
          if (stageClickMode === 'off') return
          onStageClick(event.clientX, event.clientY)
        }}
      />
      {camera.playback.playError && (
        <div className="stage-play-error" data-play-error>
          <p className="lost-banner">play() fehlgeschlagen: {camera.playback.playError}</p>
        </div>
      )}
      {live && playable && camera.status.source !== 'file' && (
        <div className="stage-framing" data-geometry-revision={camera.geometryRevision}>
          {camera.framingHint && (
            <p className="lost-banner" data-framing-hint>
              Der Bildausschnitt könnte sich außerhalb der App geändert haben. Kalibrierung und Maßstab
              gelten dann nicht mehr.
            </p>
          )}
          <button type="button" data-action="framing-changed" onClick={camera.confirmFramingChanged}>
            Bildausschnitt geändert
          </button>
        </div>
      )}
      {(!live || !playable) && !camera.playback.playError && (
        <div className="stage-empty">
          <p className="kicker">Bühne</p>
          <h1>Seitenansicht</h1>
          <p>
            {emptyHint ??
              `Kamera starten oder eine lokale Datei öffnen, wenn die Seitenansicht steht.${
                pose.frameSync !== 'idle' ? ` Overlay läuft.` : ''
              }`}
          </p>
        </div>
      )}
      {live && playable && camera.status.source === 'file' && (
        <ReplayBar
          playback={camera.replay}
          transform={camera.transform}
          staticCheck={camera.staticCheck}
          onPlay={camera.play}
          onPause={camera.pause}
          onRestart={camera.restartReplay}
          onSeek={camera.seek}
          onStep={camera.stepFrame}
          onRotate={camera.rotate}
          onCrop={camera.setCrop}
        />
      )}
    </div>
  )
}
