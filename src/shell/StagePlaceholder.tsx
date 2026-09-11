import { DEV_PORT } from '../config/defaults.ts'

export function StagePlaceholder() {
  return (
    <div className="stage-empty">
      <p className="kicker">Stage</p>
      <h1>Side-view frame</h1>
      <p>
        Camera and Ist overlay mount here. Dev server is pinned to port{' '}
        <code>{DEV_PORT}</code>. Chrome on macOS, video-only permission after
        click.
      </p>
    </div>
  )
}
