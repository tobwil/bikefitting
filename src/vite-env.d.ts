/// <reference types="vite/client" />

declare const __BIKEFIT_COMMIT__: string
declare const __BIKEFIT_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_ALLOW_SYNTHETIC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
