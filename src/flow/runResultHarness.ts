import { runResultHarness } from './resultHarness.ts'

const result = runResultHarness()
console.log(result.message)
for (const item of result.cases) {
  const mark = item.passed ? 'ok' : 'FAIL'
  console.log(`  [${mark}] ${item.name} — ${item.detail}`)
}
if (!result.passed) {
  const exit = (globalThis as { process?: { exit: (code: number) => void } }).process?.exit
  exit?.(1)
  throw new Error(result.message)
}
