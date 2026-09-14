import { runAnalysisHarness } from './harness.ts'

const result = await runAnalysisHarness()
console.log(result.message)
for (const item of result.cases) {
  console.log(`  ${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (!result.passed) {
  throw new Error(result.message)
}
console.log('ANALYSIS_HARNESS_OK')
