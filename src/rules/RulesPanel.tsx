import { useMemo, useState } from 'react'
import type { RuleMeasurement, RuleProfile } from '../types/rules.ts'
import { MetricCard } from '../flow/components/MetricCard.tsx'
import { RULE_PROFILES } from './catalog.ts'
import { RULE_PLUMBING_FIXTURES, evaluateProfile } from './evaluate.ts'
import { runRulesHarness, type RulesHarnessResult } from './harness.ts'
import { metricCardFixtures } from './cardFixtures.ts'
import { presentMetricCard } from './metricCard.ts'
import './rules.css'

export type RulesPanelProps = {
  measurement?: RuleMeasurement | null
  profiles?: RuleProfile[]
}

const FIXTURE_KEYS = ['live', ...Object.keys(RULE_PLUMBING_FIXTURES)] as const

export function RulesPanel({ measurement = null, profiles = RULE_PROFILES }: RulesPanelProps) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [plumbing, setPlumbing] = useState(false)
  const [fixture, setFixture] = useState<(typeof FIXTURE_KEYS)[number]>('live')
  const [harness, setHarness] = useState<RulesHarnessResult | null>(null)

  const activeMeasurement = fixture === 'live' ? measurement : RULE_PLUMBING_FIXTURES[fixture]
  const result = useMemo(
    () => evaluateProfile(profileId, activeMeasurement, plumbing),
    [profileId, activeMeasurement, plumbing],
  )

  const { profile, decision, ampel, recommendation } = result
  const bannerClass =
    ampel.productionAmpel ? 'is-production' : ampel.plumbingOnly ? 'is-provisional' : 'is-gray'

  return (
    <section className="module-slot" data-module="rules">
      <header>
        <p className="kicker">Rules · E6</p>
        <h2>{profile?.copy.metricLabel ?? 'Kein Profil'}</h2>
      </header>
      <p>
        Versioned JSON profiles. Productive Ampel only if{' '}
        <code>productionEnabled</code> and an explicit label. Shipped profiles are
        provisional or Nutzerziel.
      </p>

      <p
        className={`rules-banner ${bannerClass}`}
        data-ampel-label={ampel.label}
        data-production-ampel={ampel.productionAmpel ? 'true' : 'false'}
      >
        {ampel.label}
      </p>

      <div
        className="ampel"
        data-ampel-tone={ampel.tone}
        data-ampel-state={ampel.state}
        aria-label={ampel.label}
      >
        <span className="ampel-lamp" title="within_target" />
        <span className="ampel-lamp" title="borderline" />
        <span className="ampel-lamp" title="outside_target" />
      </div>

      <div className="field">
        Profile
        <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
          {profiles.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.status} · prod={String(item.productionEnabled)}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        Fixture
        <select
          value={fixture}
          onChange={(event) => setFixture(event.target.value as (typeof FIXTURE_KEYS)[number])}
        >
          <option value="live">live measurement</option>
          <option value="none">none</option>
          <option value="invalid">invalid</option>
          <option value="few_cycles">few cycles</option>
          <option value="within">within</option>
          <option value="borderline">borderline</option>
          <option value="outside">outside</option>
          <option value="high_spread">high spread (IQR)</option>
        </select>
      </div>

      <label className="plumbing-toggle">
        <input
          type="checkbox"
          checked={plumbing}
          onChange={(event) => setPlumbing(event.target.checked)}
        />
        UI plumbing: labeled provisional colors
      </label>

      {profile && (
        <div className="rules-card-preview" data-area="metric-card-preview">
          <MetricCard
            card={presentMetricCard({
              id: 'knee_flexion',
              label: profile.copy.metricLabel,
              value: activeMeasurement?.valueDeg ?? null,
              method: activeMeasurement?.method ?? profile.method,
              usableCycles: activeMeasurement?.cycles ?? 0,
              spreadDeg: activeMeasurement?.uncertaintyDeg ?? null,
              qualityOk: Boolean(activeMeasurement?.valid && activeMeasurement.valueDeg != null),
              profile,
            })}
            ampel={ampel.productionAmpel}
          />
        </div>
      )}

      <dl className="readout compact">
        <div>
          <dt>Status</dt>
          <dd>{profile?.status ?? '—'}</dd>
        </div>
        <div>
          <dt>Pipeline</dt>
          <dd>{decision.state}</dd>
        </div>
        <div>
          <dt>Ampel</dt>
          <dd>{ampel.tone}</dd>
        </div>
        <div>
          <dt>Value</dt>
          <dd>
            {decision.valueDeg !== null ? `${decision.valueDeg.toFixed(1)}°` : '—'}
          </dd>
        </div>
        <div>
          <dt>Cycles</dt>
          <dd>
            {decision.cycles ?? '—'}
            {decision.minCycles !== null ? ` / ${decision.minCycles}` : ''}
          </dd>
        </div>
      </dl>

      <dl className="recommendation">
        <div>
          <dt>Beobachtung</dt>
          <dd>{recommendation.observation}</dd>
        </div>
        <div>
          <dt>Mögliche Erklärung</dt>
          <dd>{recommendation.possibleCause}</dd>
        </div>
        <div>
          <dt>Voraussetzung</dt>
          <dd>{recommendation.prerequisite}</dd>
        </div>
        <div>
          <dt>Nächster Schritt</dt>
          <dd>{recommendation.nextStep}</dd>
        </div>
        <div>
          <dt>Erneut messen</dt>
          <dd>{recommendation.remeasure}</dd>
        </div>
      </dl>

      <div className="rules-card-gallery" data-area="metric-card-gallery">
        {metricCardFixtures().map((item) => (
          <figure key={item.id} data-fixture={item.id}>
            <figcaption>{item.title}</figcaption>
            <MetricCard card={item.card} ampel={item.ampel} />
          </figure>
        ))}
      </div>

      <div className="btn-row">
        <button type="button" onClick={() => setHarness(runRulesHarness())}>
          Rules harness
        </button>
      </div>
      {harness && (
        <p className={harness.passed ? 'ok-note' : 'status-idle'}>{harness.message}</p>
      )}
    </section>
  )
}
