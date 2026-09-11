import { runPhaseHarness } from './phaseHarness.ts'

const result = runPhaseHarness()
console.log(result.message)
for (const testCase of result.cases) {
  console.log(`  ${testCase.passed ? 'PASS' : 'FAIL'}  ${testCase.name} — ${testCase.detail}`)
}
if (!result.passed) {
  throw new Error(result.message)
}
console.log('PHASE_HARNESS_OK')
