import { SESSION_EXPORT_KIND, SESSION_SCHEMA_VERSION, type MeasurementSession } from '../types/session.ts'
import { compareSessions } from './compare.ts'
import { sessionToJson, sessionToMarkdown, sessionsToExportJson } from './export.ts'
import { parseImportJson } from './import.ts'
import { parseSession } from './schema.ts'
import { buildSession, emptyMetrics, emptyQuality } from './snapshot.ts'
import { createMemoryBackend } from './storage.ts'

export type SessionsHarnessCase = {
  name: string
  passed: boolean
  detail: string
}

export type SessionsHarnessResult = {
  passed: boolean
  message: string
  cases: SessionsHarnessCase[]
}

function fixture(overrides: Partial<MeasurementSession> = {}): MeasurementSession {
  const base = buildSession({
    bike: 'Canyon Endurace',
    side: 'right',
    handPosition: 'hoods',
    calibrationVersion: 1,
    label: 'baseline',
    capturedAt: '2026-09-11T10:00:00.000Z',
    metrics: {
      kneeFlexionDeg: 32,
      crankAngleDeg: 90,
      pedalPhase01: 0.25,
      pedalRevolutions: 4,
      inferenceMs: 12.5,
    },
    quality: {
      landmarkVisibility: 0.8,
      poseEngine: 'synthetic',
      frameSync: 'raf',
      pedalStatus: 'locked',
      calibrationReady: true,
    },
  })
  return { ...base, ...overrides, conditions: { ...base.conditions, ...overrides.conditions }, metrics: { ...base.metrics, ...overrides.metrics }, quality: { ...base.quality, ...overrides.quality } }
}

function check(name: string, passed: boolean, detail: string): SessionsHarnessCase {
  return { name, passed, detail }
}

export async function runSessionsHarness(): Promise<SessionsHarnessResult> {
  const cases: SessionsHarnessCase[] = []

  const valid = fixture()
  const parsedValid = parseSession(valid)
  cases.push(check('schema accepts a complete session', parsedValid.ok, parsedValid.ok ? valid.id : parsedValid.reason))

  const missingId = parseSession({ ...valid, id: '' })
  cases.push(check('schema rejects empty id', !missingId.ok, missingId.ok ? 'accepted empty id' : missingId.reason))

  const badVersion = parseSession({ ...valid, schemaVersion: 99 })
  cases.push(
    check('schema rejects unknown schemaVersion', !badVersion.ok, badVersion.ok ? 'accepted v99' : badVersion.reason),
  )

  const nanMetric = parseSession({ ...valid, metrics: { ...valid.metrics, kneeFlexionDeg: Number.NaN } })
  cases.push(check('schema rejects NaN metrics', !nanMetric.ok, nanMetric.ok ? 'accepted NaN' : nanMetric.reason))

  const infMetric = parseSession({ ...valid, metrics: { ...valid.metrics, inferenceMs: Number.POSITIVE_INFINITY } })
  cases.push(check('schema rejects Infinity metrics', !infMetric.ok, infMetric.ok ? 'accepted Infinity' : infMetric.reason))

  const notObject = parseSession(null)
  cases.push(check('schema rejects null', !notObject.ok, notObject.ok ? 'accepted null' : notObject.reason))

  const afterSame = fixture({
    id: 'after-same',
    capturedAt: '2026-09-11T11:00:00.000Z',
    metrics: { ...valid.metrics, kneeFlexionDeg: 38, pedalRevolutions: 11 },
  })
  const same = compareSessions(valid, afterSame)
  cases.push(
    check(
      'same conditions are comparable',
      same.comparable && !same.restricted && same.deltas.kneeFlexionDeg === 6 && same.deltas.pedalRevolutions === 7,
      JSON.stringify(same),
    ),
  )

  const otherBike = fixture({
    id: 'other-bike',
    conditions: { ...valid.conditions, bike: 'Other bike' },
  })
  const restrictedBike = compareSessions(valid, otherBike)
  cases.push(
    check(
      'different bike marks comparison restricted',
      restrictedBike.restricted && restrictedBike.restrictedReasons.includes('bike') && !restrictedBike.comparable,
      JSON.stringify(restrictedBike.restrictedReasons),
    ),
  )

  const otherSide = fixture({
    id: 'other-side',
    conditions: { ...valid.conditions, side: 'left' },
  })
  const restrictedSide = compareSessions(valid, otherSide)
  cases.push(
    check(
      'different side marks comparison restricted',
      restrictedSide.restricted && restrictedSide.restrictedReasons.includes('side'),
      JSON.stringify(restrictedSide.restrictedReasons),
    ),
  )

  const otherHand = fixture({
    id: 'other-hand',
    conditions: { ...valid.conditions, handPosition: 'drops' },
  })
  const restrictedHand = compareSessions(valid, otherHand)
  cases.push(
    check(
      'different hand position marks comparison restricted',
      restrictedHand.restricted && restrictedHand.restrictedReasons.includes('handPosition'),
      JSON.stringify(restrictedHand.restrictedReasons),
    ),
  )

  const otherCal = fixture({
    id: 'other-cal',
    conditions: { ...valid.conditions, calibrationVersion: 2 },
  })
  const restrictedCal = compareSessions(valid, otherCal)
  cases.push(
    check(
      'different calibration version marks comparison restricted',
      restrictedCal.restricted && restrictedCal.restrictedReasons.includes('calibrationVersion'),
      JSON.stringify(restrictedCal.restrictedReasons),
    ),
  )

  const md = sessionToMarkdown(valid)
  cases.push(
    check(
      'markdown export has conditions + metrics and denies Ampel/video',
      md.includes('Canyon Endurace') &&
        md.includes('hoods') &&
        md.includes('Knee flexion') &&
        md.includes('No video') &&
        md.includes('No Ampel') &&
        !md.includes('videoUrl') &&
        !md.includes('traffic-light verdict'),
      'markdown ok',
    ),
  )

  const json = sessionToJson(valid)
  const roundTrip = parseImportJson(json)
  cases.push(
    check(
      'JSON export round-trips a single session',
      roundTrip.ok && roundTrip.sessions.length === 1 && roundTrip.sessions[0]?.id === valid.id,
      roundTrip.error ?? 'ok',
    ),
  )

  const envelope = sessionsToExportJson([valid, afterSame])
  const envParsed = JSON.parse(envelope) as { kind: string; sessions: unknown[] }
  cases.push(
    check(
      'bundle export uses the sessions envelope (no video)',
      envParsed.kind === SESSION_EXPORT_KIND &&
        envParsed.sessions.length === 2 &&
        !envelope.includes('video') &&
        !envelope.includes('blob'),
      envParsed.kind,
    ),
  )

  const imported = parseImportJson(envelope)
  cases.push(
    check(
      'import accepts a valid envelope',
      imported.ok && imported.sessions.length === 2 && imported.rejected.length === 0,
      imported.error ?? `${imported.sessions.length} sessions`,
    ),
  )

  const badJson = parseImportJson('{not json')
  cases.push(check('import rejects invalid JSON', !badJson.ok && badJson.error === 'invalid JSON', badJson.error ?? ''))

  const corrupt = parseImportJson(JSON.stringify({ ...valid, metrics: { kneeFlexionDeg: 'nope' } }))
  cases.push(
    check(
      'import rejects corrupt session data',
      !corrupt.ok && (corrupt.error ?? '').includes('corrupt data rejected'),
      corrupt.error ?? '',
    ),
  )

  const mixed = parseImportJson(JSON.stringify({ kind: SESSION_EXPORT_KIND, schemaVersion: SESSION_SCHEMA_VERSION, exportedAt: valid.capturedAt, sessions: [valid, { nope: true }] }))
  cases.push(
    check(
      'import keeps valid rows and rejects corrupt rows in a bundle',
      mixed.ok && mixed.sessions.length === 1 && mixed.rejected.length === 1,
      `imported=${mixed.sessions.length} rejected=${mixed.rejected.length}`,
    ),
  )

  const store = createMemoryBackend()
  await store.put(valid)
  await store.put(afterSame)
  const listed = await store.list()
  cases.push(check('memory backend lists saved sessions', listed.length === 2, `n=${listed.length}`))
  await store.delete(valid.id)
  const afterDelete = await store.list()
  cases.push(check('delete removes a single session', afterDelete.length === 1 && afterDelete[0]?.id === afterSame.id, `n=${afterDelete.length}`))
  await store.clear()
  const afterClear = await store.list()
  cases.push(check('clear all empties the store', afterClear.length === 0, `n=${afterClear.length}`))

  const empty = buildSession({
    bike: '  Test Bike  ',
    side: '—',
    handPosition: 'tops',
    metrics: emptyMetrics(),
    quality: emptyQuality(),
  })
  cases.push(
    check(
      'snapshot trims bike and coerces unknown side to right',
      empty.conditions.bike === 'Test Bike' && empty.conditions.side === 'right' && empty.metrics.kneeFlexionDeg === null,
      `${empty.conditions.bike}/${empty.conditions.side}`,
    ),
  )

  const failed = cases.filter((c) => !c.passed)
  const passed = failed.length === 0
  return {
    passed,
    message: passed
      ? `SESSIONS_OK — ${cases.length} checks (schema, compare, export, import, delete). No Ampel.`
      : `SESSIONS_FAIL — ${failed.map((c) => c.name).join('; ')}`,
    cases,
  }
}
