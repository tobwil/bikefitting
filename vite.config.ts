import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** E0 default preview/dev port. Keep in sync with README + package.json scripts. */
export const DEV_PORT = 47321

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: DEV_PORT,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: DEV_PORT,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
})
