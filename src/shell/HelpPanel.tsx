import { appBuildInfo } from '../config/buildInfo.ts'
import { LOCAL_ORIGIN } from '../local/constants.ts'
import { HELP_TOPICS } from '../local/help.ts'

export function HelpPanel({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const build = appBuildInfo()
  return (
    <details className="help-panel" data-area="help" open={defaultOpen || undefined}>
      <summary>
        Hilfe
        <span className="help-build" data-build-version={build.version} data-build-commit={build.commit}>
          {build.version} · {build.commit}
        </span>
      </summary>
      <div className="help-body">
        <p className="help-origin">
          Lokale Adresse fest: <code>{LOCAL_ORIGIN}</code>
        </p>
        {HELP_TOPICS.map((topic) => (
          <section key={topic.id} data-help-topic={topic.id}>
            <h3>{topic.title}</h3>
            <p>{topic.body}</p>
          </section>
        ))}
      </div>
    </details>
  )
}
