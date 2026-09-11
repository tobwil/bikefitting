import { useFit } from './FitSession.tsx'

export function Stage() {
  const { videoRef, overlayRef, camera, onStageClick, pose } = useFit()
  const live = camera.status.permission === 'granted' && camera.stream

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
        className="stage-overlay"
        aria-label="Ist skeleton overlay"
        onClick={(event) => onStageClick(event.clientX, event.clientY)}
      />
      {!live && (
        <div className="stage-empty">
          <p className="kicker">Stage</p>
          <h1>Side-view frame</h1>
          <p>
            Click <strong>Start camera</strong> or <strong>Synthetic fixture</strong> in
            the rail. Overlay shares the video frame clock
            {pose.frameSync !== 'idle' ? ` (${pose.frameSync})` : ''}.
          </p>
        </div>
      )}
    </div>
  )
}
