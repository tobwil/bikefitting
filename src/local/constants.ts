/** Product id written to /bikefit-build.json so the starter can recognise its own server. */
export const LOCAL_APP_ID = 'bikefit-mac' as const

/** Always this host — never `localhost` or `::1`. IndexedDB/sessions are origin-scoped. */
export const LOCAL_HOSTNAME = '127.0.0.1'

/** Keep in sync with package.json scripts and vite.config.ts. */
export const LOCAL_PORT = 47321

export function localOrigin(port: number = LOCAL_PORT): string {
  return `http://${LOCAL_HOSTNAME}:${port}`
}

export const LOCAL_ORIGIN = localOrigin()

export const BUILD_INFO_PATH = '/bikefit-build.json'
