import { runAnalysisHarnessAsync } from './harness.ts'
import { runMarkerlessHarness } from './markerlessHarness.ts'

const markerless = await runMarkerlessHarness()
for (const item of markerless.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
console.log(markerless.message)

const job = await runAnalysisHarnessAsync()
for (const item of job.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
console.log(job.message)

if (!markerless.passed || !job.passed) {
  throw new Error(
    [markerless.passed ? null : markerless.message, job.passed ? null : job.message].filter(Boolean).join(' · '),
  )
}
console.log('ANALYSIS_HARNESS_OK')
