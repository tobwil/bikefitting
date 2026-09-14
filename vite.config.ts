import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { makeBuildInfo } from './src/local/buildInfo.ts'
import { BUILD_INFO_PATH, LOCAL_HOSTNAME, LOCAL_PORT } from './src/local/constants.ts'

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }

function gitCommit(): string {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0
    return dirty ? `${commit}-dirty` : commit
  } catch {
    return 'unknown'
  }
}

function bikefitBuildInfo(): Plugin {
  const info = () => makeBuildInfo({ version: pkg.version, commit: gitCommit() })
  const send = (res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(info()))
  }
  const mount = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(BUILD_INFO_PATH, (_req, res) => {
      send(res)
    })
  }
  return {
    name: 'bikefit-build-info',
    configureServer: mount,
    configurePreviewServer: mount,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'bikefit-build.json',
        source: JSON.stringify(info()),
      })
    },
  }
}

const commit = gitCommit()

/** E0 default preview/dev port. Keep in sync with README + package.json scripts. */
export const DEV_PORT = LOCAL_PORT

export default defineConfig({
  plugins: [react(), bikefitBuildInfo()],
  define: {
    __BIKEFIT_COMMIT__: JSON.stringify(commit),
    __BIKEFIT_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: LOCAL_HOSTNAME,
    port: DEV_PORT,
    strictPort: true,
  },
  preview: {
    host: LOCAL_HOSTNAME,
    port: DEV_PORT,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
})
