/** Browser enumerateDevices labels → Continuity-aware picker text. */

export function isContinuityCameraLabel(label: string): boolean {
  const lower = label.toLowerCase()
  return (
    lower.includes('iphone') ||
    lower.includes('ipad') ||
    lower.includes('continuity') ||
    lower.includes('desk view')
  )
}

/**
 * Prefer „iPhone (Continuity Camera)“ when the OS/browser label mentions iPhone or Continuity.
 * Otherwise keep the browser label.
 */
export function displayCameraDeviceLabel(label: string, index = 0): string {
  const raw = label.trim()
  if (!raw) return `Kamera ${index + 1}`
  if (!isContinuityCameraLabel(raw)) return raw
  if (/continuity camera/i.test(raw) && /iphone/i.test(raw)) return raw
  if (/iphone/i.test(raw)) {
    const extra = raw.replace(/iphone/gi, '').replace(/[()]/g, '').trim()
    return extra ? `${raw} — iPhone (Continuity Camera)` : 'iPhone (Continuity Camera)'
  }
  if (/continuity camera/i.test(raw)) return raw
  return `${raw} — Continuity Camera`
}
