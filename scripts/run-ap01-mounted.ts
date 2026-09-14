import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PORT = 47323
const CDP_PORT = 9224
const HARNESS_URL = `http://127.0.0.1:${PORT}/ap01-harness.html`
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

type CdpReply = { id?: number; result?: { result?: { value?: unknown } }; error?: { message?: string } }

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} → ${response.status}`)
  return (await response.json()) as T
}

async function withCdp<T>(wsUrl: string, fn: (send: (method: string, params?: object) => Promise<CdpReply>) => Promise<T>): Promise<T> {
  const ws = new WebSocket(wsUrl)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true })
  })
  let nextId = 1
  const pending = new Map<number, (reply: CdpReply) => void>()
  ws.addEventListener('message', (event) => {
    const reply = JSON.parse(String(event.data)) as CdpReply
    if (reply.id !== undefined) pending.get(reply.id)?.(reply)
  })
  const send = (method: string, params?: object) =>
    new Promise<CdpReply>((resolve, reject) => {
      const id = nextId++
      pending.set(id, (reply) => {
        pending.delete(id)
        if (reply.error) reject(new Error(reply.error.message ?? method))
        else resolve(reply)
      })
      ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`${method} timed out`))
        }
      }, 20000)
    })
  try {
    return await fn(send)
  } finally {
    ws.close()
  }
}

function kill(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
}

const server = await createServer({
  configFile,
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
})
await server.listen()

const chromeBin = process.env.CHROME_PATH ?? 'google-chrome'
const userDataDir = mkdtempSync(join(tmpdir(), 'bikefit-ap01-chrome-'))
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${CDP_PORT}`,
    '--remote-allow-origins=*',
    'about:blank',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let chromeErr = ''
chrome.stderr.on('data', (chunk) => {
  chromeErr += String(chunk)
})

try {
  let version: { webSocketDebuggerUrl?: string } | null = null
  for (let i = 0; i < 40; i += 1) {
    try {
      version = await json(`http://127.0.0.1:${CDP_PORT}/json/version`)
      if (version.webSocketDebuggerUrl) break
    } catch {
      await wait(100)
    }
  }
  if (!version?.webSocketDebuggerUrl) {
    throw new Error(`Chrome CDP did not start. ${chromeErr.slice(0, 800)}`)
  }

  const targets = await json<Array<{ url: string; webSocketDebuggerUrl: string; type: string }>>(
    `http://127.0.0.1:${CDP_PORT}/json/list`,
  )
  const page = targets.find((item) => item.type === 'page') ?? targets[0]
  if (!page?.webSocketDebuggerUrl) throw new Error('No Chrome page target')

  const text = await withCdp(page.webSocketDebuggerUrl, async (send) => {
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.navigate', { url: HARNESS_URL })
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      await wait(400)
      const reply = await send('Runtime.evaluate', {
        expression:
          'document.getElementById("out")?.dataset.passed ? document.getElementById("out")?.textContent : ""',
        returnByValue: true,
      })
      const value = String(reply.result?.result?.value ?? '')
      if (value.includes('AP01_MOUNTED_OK') || value.includes('AP01_MOUNTED_FAIL')) return value
    }
    const fallback = await send('Runtime.evaluate', {
      expression: 'document.getElementById("out")?.textContent ?? document.body?.innerText ?? ""',
      returnByValue: true,
    })
    return String(fallback.result?.result?.value ?? 'AP01_MOUNTED_FAIL — timeout')
  })

  console.log(text)
  if (!text.includes('AP01_MOUNTED_OK') || text.includes('AP01_MOUNTED_FAIL')) {
    throw new Error(text.split('\n').find((line) => line.includes('AP01_MOUNTED_FAIL')) ?? 'AP01_MOUNTED_FAIL')
  }
  console.log('AP01_MOUNTED_OK')
} finally {
  kill(chrome)
  await server.close()
}
