export async function sha256Hex(data: BufferSource): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('SHA-256 needs Web Crypto')
  }
  const digest = await subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function newCaptureId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
