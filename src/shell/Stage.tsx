import { useLayoutEffect } from 'react'
import { useFit } from './FitSession.tsx'

export function Stage({ emptyHint }: { emptyHint?: string } = {}) {
  const { videoRef, overlayRef, camera, onStageClick, pose, stageClickEnabled, setStageMounted } = useFit()
  const live = camera.status.permission === 'granted' && Boolean(camera.stream)

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
        className={live ? 'stage-video' : 'stage-video is-empty'}
      />
      <canvas
        ref={overlayRef}
        className={stageClickEnabled ? 'stage-overlay' : 'stage-overlay is-passive'}
        aria-label="Ist- und Soll-Overlay"
        onClick={(event) => {
          if (!stageClickEnabled) return
          onStageClick(event.clientX, event.clientY)
        }}
      />
      {!live && (
        <div className="stage-empty">
          <p className="kicker">Bühne</p>
          <h1>Seitenansicht</h1>
          <p>
            {emptyHint ??
              `Kamera starten, wenn die Seitenansicht steht.${
                pose.frameSync !== 'idle' ? ` Overlay läuft.` : ''
              }`}
          </p>
        </div>
      )}
    </div>
  )
}
