import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { readSharedSourceUrl } from './lib/share.ts'

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// Shared API links start with different state from the prerendered homepage.
if (root.hasChildNodes() && !readSharedSourceUrl(window.location.href)) {
  hydrateRoot(root, app)
} else {
  createRoot(root).render(app)
}
