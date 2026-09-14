import { runMountedCaptureHarness } from './runBrowserHarness.ts'

const out = document.getElementById('out')

function write(text: string, passed: boolean) {
  if (out) {
    out.textContent = text
    out.dataset.passed = passed ? 'true' : 'false'
  }
  document.title = passed ? 'CAPTURE_MOUNTED_OK' : 'CAPTURE_MOUNTED_FAIL'
  document.documentElement.dataset.passed = passed ? 'true' : 'false'
}

try {
  const result = await Promise.race([
    runMountedCaptureHarness(),
    new Promise<Awaited<ReturnType<typeof runMountedCaptureHarness>>>((resolve) => {
      window.setTimeout(
        () =>
          resolve({
            passed: false,
            cases: [{ name: 'mounted timeout', passed: false, detail: '25s' }],
            message: 'CAPTURE_MOUNTED_FAIL — timeout',
          }),
        25_000,
      )
    }),
  ])
  const lines = result.cases.map((item) => `${item.passed ? 'PASS' : 'FAIL'}  ${item.name} — ${item.detail}`)
  write(`${lines.join('\n')}\n${result.message}`, result.passed)
} catch (error) {
  write(`CAPTURE_MOUNTED_FAIL — ${error instanceof Error ? error.message : String(error)}`, false)
}
