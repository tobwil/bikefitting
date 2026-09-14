import { runAp01Harness } from './ap01Harness.ts'
import { runAp01ProviderHarness } from './ap01ProviderHarness.tsx'

const out = document.getElementById('out')

function write(text: string, passed: boolean) {
  if (out) {
    out.textContent = text
    out.dataset.passed = passed ? 'true' : 'false'
  }
  document.title = passed ? 'AP01_MOUNTED_OK' : 'AP01_MOUNTED_FAIL'
  document.documentElement.dataset.passed = passed ? 'true' : 'false'
}

const helper = await runAp01Harness()
const lines = helper.cases.map((item) => `${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
let mounted
try {
  mounted = await Promise.race([
    runAp01ProviderHarness(),
    new Promise<typeof helper>((resolve) => {
      window.setTimeout(
        () =>
          resolve({
            passed: false,
            cases: [{ name: 'mounted timeout', passed: false, detail: '40s' }],
            message: 'AP01_MOUNTED_FAIL — timeout',
          }),
        40_000,
      )
    }),
  ])
} catch (error) {
  mounted = {
    passed: false,
    cases: [
      {
        name: 'mounted threw',
        passed: false,
        detail: error instanceof Error ? error.message : String(error),
      },
    ],
    message: 'AP01_MOUNTED_FAIL — threw',
  }
}
for (const item of mounted.cases) {
  lines.push(`${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
}
lines.push(helper.message)
lines.push(mounted.message)
const passed = helper.passed && mounted.passed
lines.push(passed ? 'AP01_MOUNTED_OK' : 'AP01_MOUNTED_FAIL')
const text = lines.join('\n')
console.log(text)
write(text, passed)
