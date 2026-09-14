import { HELP_TOPIC_IDS, HELP_TOPICS, helpTopic } from './help.ts'
import { LOCAL_HOSTNAME, LOCAL_ORIGIN, LOCAL_PORT } from './constants.ts'
import { isStableLocalOrigin, stableOriginHref } from './origin.ts'
import { makeBuildInfo } from './buildInfo.ts'
import { classifyOccupant, parseLsofListen, planStart } from './portPolicy.ts'

const cases: Array<{ name: string; passed: boolean; detail: string }> = []

function check(name: string, passed: boolean, detail: string) {
  cases.push({ name, passed, detail })
}

export function runLocalHarness(): { passed: boolean; message: string; cases: typeof cases } {
  cases.length = 0

  check(
    'stable origin is 127.0.0.1 and the product port',
    LOCAL_ORIGIN === `http://127.0.0.1:${LOCAL_PORT}` && LOCAL_HOSTNAME === '127.0.0.1',
    LOCAL_ORIGIN,
  )

  const fromLocalhost = stableOriginHref({
    protocol: 'http:',
    hostname: 'localhost',
    port: String(LOCAL_PORT),
    pathname: '/',
    search: '',
    hash: '',
  })
  check(
    'localhost flips to 127.0.0.1 and keeps the port',
    fromLocalhost === LOCAL_ORIGIN + '/',
    fromLocalhost ?? 'null',
  )

  const fromIpv6 = stableOriginHref({
    protocol: 'http:',
    hostname: '[::1]',
    port: String(LOCAL_PORT),
    pathname: '/flow',
    search: '?x=1',
    hash: '#help',
  })
  check(
    '::1 flips to 127.0.0.1 and keeps path',
    fromIpv6 === `${LOCAL_ORIGIN}/flow?x=1#help`,
    fromIpv6 ?? 'null',
  )

  const alreadyStable = stableOriginHref({
    protocol: 'http:',
    hostname: '127.0.0.1',
    port: String(LOCAL_PORT),
    pathname: '/',
    search: '',
    hash: '',
  })
  check('127.0.0.1 is not redirected', alreadyStable === null, String(alreadyStable))

  const production = stableOriginHref({
    protocol: 'https:',
    hostname: 'bikefit.example',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
  })
  check('deployed hosts are not redirected', production === null, String(production))
  check('isStableLocalOrigin accepts only 127.0.0.1 http', isStableLocalOrigin(LOCAL_ORIGIN) && !isStableLocalOrigin('http://localhost:47321'), 'ok')

  const ours = classifyOccupant({
    listening: true,
    health: makeBuildInfo({ version: '0.2.0-p0', commit: 'abc1234' }),
    listener: { pid: 42, command: 'node' },
  })
  const oursPlan = planStart(ours)
  check(
    'own health JSON is reused, never respawned',
    ours.kind === 'ours' && oursPlan.action === 'reuse' && oursPlan.origin === LOCAL_ORIGIN,
    oursPlan.action,
  )

  const foreign = classifyOccupant({
    listening: true,
    health: { app: 'other' },
    listener: { pid: 99, command: 'Python' },
  })
  const foreignPlan = planStart(foreign)
  check(
    'foreign listener is blocked and not killed',
    foreign.kind === 'foreign' &&
      foreignPlan.action === 'block-foreign' &&
      !/kill|SIGTERM|SIGKILL|pkill/i.test(JSON.stringify(foreignPlan)) &&
      foreignPlan.message.includes('beendet fremde Programme nicht') &&
      foreignPlan.message.includes('PID 99 (Python)'),
    foreignPlan.action === 'block-foreign' ? foreignPlan.message : foreignPlan.action,
  )

  const occupiedNoHealth = classifyOccupant({ listening: true, health: null })
  const occupiedPlan = planStart(occupiedNoHealth)
  check(
    'open port without BikeFit JSON is foreign, not ours',
    occupiedNoHealth.kind === 'foreign' && occupiedPlan.action === 'block-foreign',
    occupiedNoHealth.kind,
  )

  const freePlan = planStart(classifyOccupant({ listening: false, health: null }))
  check('free port plans a single start', freePlan.action === 'start' && freePlan.origin === LOCAL_ORIGIN, freePlan.action)

  const parsed = parseLsofListen(
    'COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nPython    4455 tobias   3u  IPv4 0x0      0t0  TCP 127.0.0.1:47321 (LISTEN)\n',
  )
  check(
    'lsof parse names the foreign process',
    parsed?.pid === 4455 && parsed.command === 'Python',
    parsed ? `${parsed.command} ${parsed.pid}` : 'null',
  )

  const ids = HELP_TOPICS.map((topic) => topic.id)
  check(
    'help covers combo, results, lost connection, permission, busy camera, hidden iPhone',
    HELP_TOPIC_IDS.every((id) => ids.includes(id)) && HELP_TOPICS.length === HELP_TOPIC_IDS.length,
    ids.join(','),
  )
  check(
    'help names the supported Mac/iPhone/Chrome combo',
    /Google Chrome/.test(helpTopic('combo').body) &&
      /Safari/.test(helpTopic('combo').body) &&
      /Continuity/.test(helpTopic('combo').body) &&
      /iPhone/.test(helpTopic('combo').body),
    'combo',
  )
  check(
    'help finds live and saved results on the stable origin',
    /BikeFit starten/.test(helpTopic('find-results').body) &&
      /Frühere Ergebnisse/.test(helpTopic('find-results').body) &&
      helpTopic('find-results').body.includes(LOCAL_ORIGIN),
    'find-results',
  )
  check(
    'help explains lost connection without a terminal',
    /kein Terminal/.test(helpTopic('lost-connection').body) &&
      /127\.0\.0\.1/.test(helpTopic('lost-connection').body),
    'lost-connection',
  )
  check(
    'help explains permission denied and camera busy and missing iPhone',
    /Schloss/.test(helpTopic('permission-denied').body) &&
      /FaceTime/.test(helpTopic('camera-busy').body) &&
      /nicht sichtbar|nicht erscheint|Menüleiste/.test(helpTopic('iphone-hidden').body),
    'camera copy',
  )

  const failed = cases.filter((item) => !item.passed)
  return {
    passed: failed.length === 0,
    message:
      failed.length === 0
        ? `LOCAL_HARNESS_OK — ${cases.length} checks.`
        : `LOCAL_HARNESS_FAIL — ${failed.map((item) => item.name).join(', ')}`,
    cases: [...cases],
  }
}
