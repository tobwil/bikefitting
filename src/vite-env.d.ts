/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALLOW_SYNTHETIC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
