import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { stableOriginHref } from './local/origin.ts'

if (typeof window !== 'undefined') {
  const next = stableOriginHref(window.location)
  if (next) {
    window.location.replace(next)
  } else {
    mount()
  }
} else {
  mount()
}

function mount() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
