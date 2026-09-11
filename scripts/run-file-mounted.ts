import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PORT = 47322
const HARNESS_URL = `http://127.0.0.1:${PORT}/file-harness.html`
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

const server = await createServer({
  configFile,
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
})
await server.listen()

const chrome = process.env.CHROME_PATH ?? 'google-chrome'

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--virtual-time-budget=60000',
    '--dump-dom',
    HARNESS_URL,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => {
  stdout += String(chunk)
})
child.stderr.on('data', (chunk) => {
  stderr += String(chunk)
})

const code: number = await new Promise((resolve) => {
  child.on('close', (next) => resolve(next ?? 1))
})

await server.close()

const passed = /data-passed="true"/.test(stdout) || /FILE_MOUNTED_OK/.test(stdout)
const failLine = stdout.match(/FILE_MOUNTED_FAIL[^\n]*/)?.[0]
const okLine = stdout.match(/FILE_MOUNTED_OK[^\n]*/)?.[0]
const cases = [...stdout.matchAll(/>(PASS|FAIL) {2}([^<]+)</g)].map((m) => `${m[1]}  ${m[2]}`)

if (cases.length > 0) {
  for (const line of cases) console.log(line)
} else {
  const text = stdout.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n')
  const extracted = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(PASS|FAIL|FILE_)/.test(line))
  for (const line of extracted) console.log(line)
}

if (!passed) {
  if (stderr.trim()) console.error(stderr.trim().slice(0, 2000))
  throw new Error(failLine ?? `FILE_MOUNTED_FAIL — chrome exited ${code}`)
}
console.log(okLine ?? 'FILE_MOUNTED_OK')
