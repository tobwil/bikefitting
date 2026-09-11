/// <reference lib="webworker" />

self.onmessage = (event: MessageEvent) => {
  const type = (event.data as { type?: string } | undefined)?.type
  if (type === 'INIT') {
    self.postMessage({ type: 'ERROR', message: 'Pose worker not implemented (E0 strand).' })
    return
  }
  if (type === 'DISPOSE') {
    self.postMessage({ type: 'DISPOSED' })
  }
}
