import { useCamera } from './useCamera.ts'

export function CameraPanel() {
  const { status } = useCamera()

  return (
    <section className="module-slot" data-module="camera">
      <header>
        <p className="kicker">Camera · AC-01 / AC-02 / AC-19</p>
        <h2>No stream yet</h2>
      </header>
      <p>
        Permission stays idle until an explicit Start click. Video only — microphone
        stays off. Status: <code>{status.permission}</code>
      </p>
      <button type="button" disabled>
        Start camera (strand)
      </button>
    </section>
  )
}
