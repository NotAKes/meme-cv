import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Retired palette previews now lead to the camera page.
if (['/themes', '/themese'].includes(window.location.pathname.replace(/\/+$/, ''))) {
  window.history.replaceState(null, '', '/')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
