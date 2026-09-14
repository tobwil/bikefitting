import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { ensureBuild, ensureNodeModules, gitCommit, REPO_ROOT } from './local-io.ts'
import { LOCAL_ORIGIN } from '../src/local/constants.ts'

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function launcherScript(root = REPO_ROOT): string {
  return `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:$PATH"
cd ${shellQuote(root)}
exec ${shellQuote(process.execPath)} --experimental-strip-types --no-warnings ${shellQuote(join(root, 'scripts/start-local.ts'))}
`
}

export function writeCommandLauncher(target: string, root = REPO_ROOT): string {
  writeFileSync(target, launcherScript(root), { mode: 0o755 })
  try {
    chmodSync(target, 0o755)
  } catch {
    /* already executable */
  }
  return target
}

function writeMacApp(root = REPO_ROOT): string | null {
  if (process.platform !== 'darwin') return null
  const appPath = join(homedir(), 'Desktop', 'BikeFit starten.app')
  const start = join(root, 'scripts/start-local.ts')
  const script = [
    'on run',
    `  set repo to ${JSON.stringify(root)}`,
    `  set nodebin to ${JSON.stringify(process.execPath)}`,
    `  set starter to ${JSON.stringify(start)}`,
    '  try',
    '    do shell script "export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:$PATH; cd " & quoted form of repo & " && " & quoted form of nodebin & " --experimental-strip-types --no-warnings " & quoted form of starter',
    '  on error errMsg',
    '    display dialog errMsg with title "BikeFit" buttons {"OK"} default button 1',
    '  end try',
    'end run',
    '',
  ].join('\n')
  const tmp = join(root, '.bikefit-starter.applescript')
  try {
    writeFileSync(tmp, script)
    mkdirSync(join(homedir(), 'Desktop'), { recursive: true })
    execFileSync('osacompile', ['-o', appPath, tmp], { stdio: 'ignore' })
    return appPath
  } catch {
    return null
  }
}

export function installTesterLaunchers(root = REPO_ROOT): string[] {
  const written: string[] = []
  const desktop = join(homedir(), 'Desktop')
  if (existsSync(desktop)) {
    written.push(writeCommandLauncher(join(desktop, 'BikeFit starten.command'), root))
    const app = writeMacApp(root)
    if (app) written.push(app)
  }
  return written
}

ensureNodeModules()
ensureBuild()
const launchers = installTesterLaunchers()
const commit = gitCommit()
console.log(`BikeFit ${commit} ist eingerichtet.`)
console.log(`Ab jetzt: „BikeFit starten“ doppelklicken — öffnet Chrome unter ${LOCAL_ORIGIN}`)
console.log(`Im Ordner: ${join(REPO_ROOT, 'BikeFit starten.command')}`)
for (const path of launchers) console.log(`Starter: ${path}`)
if (launchers.length === 0) {
  console.log('Kein Schreibtisch gefunden — den Starter im Projektordner doppelklicken.')
}
console.log('Nach einem Neustart denselben Starter verwenden. Kein Terminal, kein Port merken.')
