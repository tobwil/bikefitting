/** Local file download only — never uploads. */
export function downloadText(filename: string, body: string, mime: string): void {
  if (typeof document === 'undefined') {
    throw new Error('downloadText requires a browser document')
  }
  const blob = new Blob([body], { type: `${mime};charset=utf-8` })
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
