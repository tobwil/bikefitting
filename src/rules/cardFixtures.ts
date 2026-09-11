import type { MetricCardModel } from '../types/result.ts'
import { getRuleProfile } from './catalog.ts'
import { cardTone, presentMetricCard } from './metricCard.ts'
import { parseRuleProfile } from './schema.ts'
import { RULE_PROFILES } from './catalog.ts'

function approvedBdc() {
  return parseRuleProfile({
    ...RULE_PROFILES[0],
    id: 'knee-flexion-bdc.approved-fixture.v1',
    status: 'approved',
    productionEnabled: true,
    reviewedAt: '2026-09-11T00:00:00.000Z',
    reviewer: 'harness',
    notes: 'In-memory fixture only. Not shipped.',
  })
}

export type CardFixture = {
  id: string
  title: string
  card: MetricCardModel
  ampel: boolean
}

export function metricCardFixtures(): CardFixture[] {
  const bdc = getRuleProfile('knee-flexion-bdc.v1')
  const nutzerziel = getRuleProfile('knee-flexion-nutzerziel.v1')
  const approved = approvedBdc()
  return [
    {
      id: 'bdc-32',
      title: 'BDC 32° · Profil v1',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'bottom_dead_center',
        usableCycles: 12,
        spreadDeg: 1.4,
        qualityOk: true,
        profile: bdc,
      }),
    },
    {
      id: 'cycle-mean-32',
      title: 'Zyklusmittel 32° · gleiche Zahl',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'cycle_mean',
        usableCycles: 12,
        spreadDeg: 1.4,
        qualityOk: true,
        profile: bdc,
      }),
    },
    {
      id: 'nutzerziel-36',
      title: '36° · Nutzerziel 30±5',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 36,
        method: 'bottom_dead_center',
        usableCycles: 12,
        spreadDeg: 1,
        qualityOk: true,
        profile: nutzerziel,
      }),
    },
    {
      id: 'bdc-36',
      title: '36° · BDC-Profil 32±7',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 36,
        method: 'bottom_dead_center',
        usableCycles: 12,
        spreadDeg: 1,
        qualityOk: true,
        profile: bdc,
      }),
    },
    {
      id: 'missing',
      title: 'Keine Messung',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: null,
        method: 'bottom_dead_center',
        usableCycles: 0,
        spreadDeg: null,
        qualityOk: false,
        profile: bdc,
      }),
    },
    {
      id: 'few-cycles',
      title: 'n=3 unter minCycles',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'bottom_dead_center',
        usableCycles: 3,
        spreadDeg: 1,
        qualityOk: true,
        profile: bdc,
      }),
    },
    {
      id: 'high-spread',
      title: 'IQR 12° zu groß',
      ampel: false,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'bottom_dead_center',
        usableCycles: 12,
        spreadDeg: 12,
        qualityOk: true,
        profile: bdc,
      }),
    },
    {
      id: 'approved-within',
      title: 'Ampel nur productionEnabled',
      ampel: true,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'bottom_dead_center',
        usableCycles: 12,
        spreadDeg: 1.2,
        qualityOk: true,
        profile: approved,
      }),
    },
    {
      id: 'approved-insufficient',
      title: 'Ampel an, Daten unzureichend',
      ampel: true,
      card: presentMetricCard({
        id: 'knee_flexion',
        label: 'Kniebeugung',
        value: 32,
        method: 'bottom_dead_center',
        usableCycles: 2,
        spreadDeg: 1,
        qualityOk: true,
        profile: approved,
      }),
    },
    {
      id: 'trunk-no-profile',
      title: 'Rumpf ohne Profil',
      ampel: false,
      card: presentMetricCard({
        id: 'torso_lean',
        label: 'Rumpf / Torso',
        value: 32,
        method: 'cycle_mean',
        usableCycles: 12,
        spreadDeg: 2,
        qualityOk: true,
      }),
    },
  ]
}

export function fixtureById(id: string): CardFixture {
  const found = metricCardFixtures().find((item) => item.id === id)
  if (!found) throw new Error(`unknown card fixture ${id}`)
  return found
}

export function fixtureTone(id: string): ReturnType<typeof cardTone> {
  const item = fixtureById(id)
  return cardTone(item.card, item.ampel)
}
