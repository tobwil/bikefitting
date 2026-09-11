import { runSollHarness } from './harness.ts'

const result = runSollHarness()
console.log(result.message)
for (const item of result.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name}  ${item.status}  ${item.detail}`)
}
if (!result.passed) {
  throw new Error(result.message)
}
