import { runAnalysisHarnessAsync } from './harness.ts'

const result = await runAnalysisHarnessAsync()
for (const item of result.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (!result.passed) throw new Error(result.message)
console.log(result.message)
