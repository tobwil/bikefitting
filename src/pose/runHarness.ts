import { runPoseHarness } from './harness.ts'
import { runOverlayFilterHarness } from './overlayHarness.ts'

const result = await runPoseHarness()
for (const item of result.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (!result.passed) {
  throw new Error(result.message)
}
console.log(result.message)

const overlay = runOverlayFilterHarness()
for (const item of overlay.cases) {
  console.log(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
if (!overlay.passed) {
  throw new Error(overlay.message)
}
console.log(overlay.message)
