import { runSessionsHarness } from './harness.ts'

const result = await runSessionsHarness()
for (const testCase of result.cases) {
  console.log(`${testCase.passed ? 'PASS' : 'FAIL'}  ${testCase.name}`)
}
console.log(result.message)
if (!result.passed) {
  throw new Error(result.message)
}
