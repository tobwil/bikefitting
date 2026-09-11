import { runFileHarness } from './harness.ts'
import { runMountedProviderHarness } from './providerHarness.tsx'

const out = document.getElementById('out')

function write(text: string, passed: boolean) {
  if (out) {
    out.textContent = text
    out.dataset.passed = passed ? 'true' : 'false'
  }
  document.title = passed ? 'FILE_MOUNTED_OK' : 'FILE_MOUNTED_FAIL'
  document.documentElement.dataset.passed = passed ? 'true' : 'false'
}

const logic = runFileHarness()
const lines = logic.cases.map((item) => `${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
let mounted
try {
  mounted = await runMountedProviderHarness()
} catch (error) {
  mounted = {
    passed: false,
    cases: [{ name: 'mounted threw', passed: false, detail: error instanceof Error ? error.message : String(error) }],
    message: 'FILE_MOUNTED_FAIL — threw',
  }
}
for (const item of mounted.cases) {
  lines.push(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
lines.push(logic.message)
lines.push(mounted.message)
const passed = logic.passed && mounted.passed
lines.push(passed ? 'FILE_MOUNTED_OK' : 'FILE_MOUNTED_FAIL')
const text = lines.join('\n')
console.log(text)
write(text, passed)
if (!passed) {
  throw new Error(mounted.passed ? logic.message : mounted.message)
}
