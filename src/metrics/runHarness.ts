import { runMetricsHarness } from './harness.ts'

const result = runMetricsHarness()
console.log(result.message)
for (const c of result.cases) {
  console.log(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`)
}
if (!result.passed) {
  throw new Error(result.message)
}
console.log('METRICS_HARNESS_OK')
