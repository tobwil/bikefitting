import { execFileSync, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createConnection } from 'node:net'
import { BUILD_INFO_PATH, LOCAL_HOSTNAME, LOCAL_PORT, localOrigin } from '../src/local/constants.ts'
import { parseBuildInfo } from '../src/local/buildInfo.ts'
import { classifyOccupant, parseLsofListen, planStart, type ListenerProcess, type Occupant } from '../src/local/portPolicy.ts'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const PID_FILE = join(REPO_ROOT, '.bikefit-local.pid')
export const LOG_FILE = join(REPO_ROOT, '.bikefit-local.log')

const DIST_INFO = join(REPO_ROOT, 'dist', 'bikefit-build.json')

export type CliArgs = {
  openBrowser: boolean
  json: boolean
  stop: boolean
  port: number
}

export function parseArgs(argv: string[]): CliArgs {
  return {
    openBrowser: !argv.includes('--no-open'),
    json: argv.includes('--json'),
    stop: argv.includes('--stop'),
    port: LOCAL_PORT,
  }
}

function appleQuote(value: string): string {
  return JSON.stringify(value)
}

export function notify(message: string, kind: 'note' | 'dialog' = 'note') {
  if (process.platform !== 'darwin') return
  try {
    if (kind === 'dialog') {
      execFileSync(
        'osascript',
        ['-e', `display dialog ${appleQuote(message)} buttons {"OK"} default button "OK" with title "BikeFit"`],
        { stdio: 'ignore' },
      )
      return
    }
    execFileSync('osascript', ['-e', `display notification ${appleQuote(message)} with title "BikeFit"`], {
      stdio: 'ignore',
    })
  } catch {
    /* optional on headless Macs */
  }
}

export function report(ok: boolean, jsonMode: boolean, payload: Record<string, unknown>) {
  const message = String(payload.message ?? '')
  if (jsonMode) {
    console.log(JSON.stringify({ ok, ...payload }))
    return
  }
  if (ok) console.log(message)
  else console.error(message)
  notify(message, ok ? 'note' : 'dialog')
}

export function gitCommit(root = REPO_ROOT): string {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function portListening(port: number, host = LOCAL_HOSTNAME): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    const finish = (value: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(700)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

export async function probeHealth(origin: string): Promise<unknown> {
  try {
    const response = await fetch(`${origin}${BUILD_INFO_PATH}`, { signal: AbortSignal.timeout(1500) })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export function listenerFor(port: number): ListenerProcess | null {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
    return parseLsofListen(output)
  } catch {
    return null
  }
}

export async function currentOccupant(port = LOCAL_PORT): Promise<Occupant> {
  const origin = localOrigin(port)
  const listening = await portListening(port)
  const health = listening ? await probeHealth(origin) : null
  const listener = listening ? listenerFor(port) : null
  return classifyOccupant({ listening, health, listener, origin })
}

function readDistInfo() {
  if (!existsSync(DIST_INFO)) return null
  try {
    return parseBuildInfo(JSON.parse(readFileSync(DIST_INFO, 'utf8')))
  } catch {
    return null
  }
}

export function ensureNodeModules(root = REPO_ROOT) {
  if (existsSync(join(root, 'node_modules', 'vite', 'bin', 'vite.js'))) return
  console.log('Einmalig: Abhängigkeiten werden installiert …')
  execFileSync('npm', ['install'], { cwd: root, stdio: 'inherit' })
}

export function ensureBuild(root = REPO_ROOT) {
  const head = gitCommit(root)
  const dist = readDistInfo()
  if (dist && (dist.commit === head || dist.commit.replace(/-dirty$/, '') === head.replace(/-dirty$/, ''))) return
  console.log('Einmalig: getestete Version wird gebaut …')
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
}

export function spawnPreview(port = LOCAL_PORT, root = REPO_ROOT): number {
  const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) {
    throw new Error('Vite fehlt. Einmalige Einrichtung: npm run setup:local')
  }
  const logFd = openSync(join(root, '.bikefit-local.log'), 'a')
  try {
    const child = spawn(
      process.execPath,
      [viteBin, 'preview', '--host', LOCAL_HOSTNAME, '--port', String(port), '--strictPort'],
      {
        cwd: root,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, BROWSER: 'none' },
      },
    )
    if (!child.pid) throw new Error('BikeFit-Server konnte nicht starten.')
    writeFileSync(join(root, '.bikefit-local.pid'), `${child.pid}\n`)
    child.unref()
    return child.pid
  } finally {
    closeSync(logFd)
  }
}

export async function waitForOurs(port = LOCAL_PORT, timeoutMs = 20000): Promise<Occupant> {
  const origin = localOrigin(port)
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const occupant = await currentOccupant(port)
    if (occupant.kind !== 'free') return occupant
    await wait(250)
  }
  throw new Error(`BikeFit hat unter ${origin} nicht rechtzeitig geantwortet. Siehe ${LOG_FILE}.`)
}

function chromeCommands(url: string): Array<[string, string[]]> {
  if (process.platform === 'darwin') {
    return [
      ['open', ['-a', 'Google Chrome', url]],
      ['open', [url]],
    ]
  }
  return [
    ['google-chrome', [url]],
    ['google-chrome-stable', [url]],
    ['chromium', [url]],
    ['chromium-browser', [url]],
    ['xdg-open', [url]],
  ]
}

export function openAppWindow(url: string) {
  for (const [bin, args] of chromeCommands(url)) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' })
      return
    } catch {
      /* try next */
    }
  }
  throw new Error(`Google Chrome wurde nicht gefunden. Bitte Chrome installieren und ${url} öffnen — nicht localhost.`)
}

function readPid(root = REPO_ROOT): number | null {
  const file = join(root, '.bikefit-local.pid')
  if (!existsSync(file)) return null
  const pid = Number(readFileSync(file, 'utf8').trim())
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function stopOwnServer(port = LOCAL_PORT): Promise<{ action: 'idle' | 'stopped'; pid?: number }> {
  const occupant = await currentOccupant(port)
  if (occupant.kind === 'free') return { action: 'idle' }
  if (occupant.kind === 'foreign') {
    const plan = planStart(occupant)
    throw new Error(plan.action === 'block-foreign' ? plan.message : 'Fremder Prozess.')
  }
  const pid = readPid() ?? occupant.listener?.pid
  if (!pid || !pidAlive(pid)) {
    throw new Error('BikeFit-PID unbekannt. Fremde Programme werden nicht beendet.')
  }
  process.kill(pid, 'SIGTERM')
  return { action: 'stopped', pid }
}

function failForeign(args: CliArgs, occupant: Occupant) {
  const plan = planStart(occupant)
  const message = plan.action === 'block-foreign' ? plan.message : 'Port belegt — BikeFit beendet fremde Programme nicht.'
  report(false, args.json, {
    action: 'block-foreign',
    listener: occupant.kind === 'foreign' ? occupant.listener : null,
    origin: localOrigin(args.port),
    message,
  })
  process.exitCode = 2
}

export async function runStarter(args: CliArgs): Promise<void> {
  const origin = localOrigin(args.port)

  if (args.stop) {
    const result = await stopOwnServer(args.port)
    report(true, args.json, {
      action: result.action,
      pid: result.pid ?? null,
      origin,
      message: result.action === 'idle' ? 'BikeFit läuft nicht.' : 'BikeFit-Server beendet.',
    })
    return
  }

  ensureNodeModules()
  let occupant = await currentOccupant(args.port)
  if (occupant.kind === 'foreign') {
    failForeign(args, occupant)
    return
  }

  let action: 'reuse' | 'start' = 'reuse'
  if (occupant.kind === 'free') {
    ensureBuild()
    occupant = await currentOccupant(args.port)
    if (occupant.kind === 'foreign') {
      failForeign(args, occupant)
      return
    }
    if (occupant.kind === 'free') {
      spawnPreview(args.port)
      occupant = await waitForOurs(args.port)
      action = 'start'
    }
  }

  if (occupant.kind === 'foreign') {
    failForeign(args, occupant)
    return
  }
  if (occupant.kind !== 'ours') {
    report(false, args.json, {
      action: 'missing',
      origin,
      message: `BikeFit antwortet nicht unter ${origin}. Siehe ${LOG_FILE}.`,
    })
    process.exitCode = 2
    return
  }

  if (args.openBrowser) {
    try {
      openAppWindow(origin)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chrome konnte nicht geöffnet werden.'
      report(false, args.json, { action: 'browser', origin, message })
      process.exitCode = 2
      return
    }
  }

  report(true, args.json, {
    action,
    origin,
    commit: occupant.info.commit,
    version: occupant.info.version,
    pid: readPid(),
    message:
      action === 'reuse' ? `BikeFit läuft bereits unter ${origin}` : `BikeFit ist bereit unter ${origin}`,
  })
}
