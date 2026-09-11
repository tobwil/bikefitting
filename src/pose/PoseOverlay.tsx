export function PoseOverlay() {
  return (
    <section className="module-slot" data-module="pose">
      <header>
        <p className="kicker">Ist skeleton · worker</p>
        <h2>No landmarks yet</h2>
      </header>
      <p>
        MediaPipe Pose Landmarker runs in a Web Worker (VIDEO mode). Overlay must
        share the video frame clock — no visible lag vs. the camera.
      </p>
      <canvas aria-label="Ist skeleton overlay" width={16} height={9} />
    </section>
  )
}
