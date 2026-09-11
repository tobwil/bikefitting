#!/usr/bin/env node
/**
 * Vendor MediaPipe Pose Landmarker assets for BikeFit Mac E0.
 * Copies WASM from the pinned npm package and downloads float16/1 .task
 * files (never @latest). Verifies SHA-256 against the E0 pins.
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'models')
const WASM_SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const WASM_DEST = join(OUT_DIR, 'wasm')
const PKG = '@mediapipe/tasks-vision@0.10.35'

const MODELS = [
  {
    file: 'pose_landmarker_lite.task',
    source:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    bytes: 5777746,
    sha256: '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
  },
  {
    file: 'pose_landmarker_full.task',
    source:
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    bytes: 9398198,
    sha256: '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1',
  },
]

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

async function listFiles(dir, acc = [], base = dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) await listFiles(p, acc, base)
    else acc.push(relative(base, p).replaceAll('\\', '/'))
  }
  return acc
}

async function main() {
  try {
    await stat(WASM_SRC)
  } catch {
    throw new Error(
      `Missing ${WASM_SRC} — run \`npm install\` first so ${PKG} is present.`,
    )
  }

  await mkdir(OUT_DIR, { recursive: true })
  await cp(WASM_SRC, WASM_DEST, { recursive: true })

  const modelRows = []
  for (const model of MODELS) {
    const dest = join(OUT_DIR, model.file)
    const buf = await download(model.source)
    const hash = sha256(buf)
    if (buf.length !== model.bytes) {
      throw new Error(`${model.file}: expected ${model.bytes} bytes, got ${buf.length}`)
    }
    if (hash !== model.sha256) {
      throw new Error(
        `${model.file}: SHA-256 mismatch\n  expected ${model.sha256}\n  got      ${hash}`,
      )
    }
    await writeFile(dest, buf)
    console.log(`ok ${model.file} ${buf.length} ${hash}`)
    modelRows.push(
      `| \`${model.file}\` | ${model.source} | ${buf.length} | \`${hash}\` |`,
    )
  }

  const wasmFiles = (await listFiles(WASM_DEST)).sort()
  const wasmRows = []
  for (const rel of wasmFiles) {
    const buf = await readFile(join(WASM_DEST, rel))
    const hash = sha256(buf)
    console.log(`ok wasm/${rel} ${buf.length} ${hash}`)
    wasmRows.push(`| \`wasm/${rel}\` | npm ${PKG} | ${buf.length} | \`${hash}\` |`)
  }

  const manifest = `# MediaPipe model manifest (E0)

Package: \`${PKG}\`
WASM copied from \`node_modules/@mediapipe/tasks-vision/wasm\` → \`public/models/wasm/\`.
Model URLs use **float16/1**, not \`latest\`.

| File | Source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
${modelRows.join('\n')}

### WASM

| File | Source | Bytes | SHA-256 |
| --- | --- | ---: | --- |
${wasmRows.join('\n')}

Regenerate: \`npm run vendor:mediapipe\`.
`
  await writeFile(join(OUT_DIR, 'MANIFEST.md'), manifest)
  console.log('wrote public/models/MANIFEST.md')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
