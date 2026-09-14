import { LOCAL_HOSTNAME, LOCAL_PORT, localOrigin } from './constants.ts'

export type OriginLocation = {
  protocol: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
}

const LOOPBACK_HOSTS = new Set(['localhost', '::1', '[::1]'])

function portFor(location: OriginLocation): number {
  if (location.port) {
    const parsed = Number(location.port)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : LOCAL_PORT
  }
  if (location.protocol === 'https:') return 443
  return 80
}

/**
 * If the tester opened the loopback name that is not 127.0.0.1, return the stable href.
 * Production hosts and already-stable loopback are left alone.
 */
export function stableOriginHref(location: OriginLocation): string | null {
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null
  if (location.hostname === LOCAL_HOSTNAME) return null
  if (!LOOPBACK_HOSTS.has(location.hostname)) return null
  const port = location.port ? portFor(location) : LOCAL_PORT
  return `${localOrigin(port)}${location.pathname}${location.search}${location.hash}`
}

export function isStableLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && url.hostname === LOCAL_HOSTNAME
  } catch {
    return false
  }
}
