/** Local file download only — never uploads. Markdown uses octet-stream so Chrome saves instead of navigating. */
export function downloadText(filename: string, body: string, mime: string): void {
  if (typeof document === 'undefined') {
    throw new Error('downloadText requires a browser document')
  }
  const type = mime.includes('json') ? 'application/json' : 'application/octet-stream'
  const blob = new Blob([body], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
