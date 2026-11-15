import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemePage } from './components/ThemePage'
import { applyTheme, loadTheme, themeStorageKey } from './lib/theme'

applyTheme(loadTheme())
window.addEventListener('storage', event => {
  if (event.key === themeStorageKey || event.key === null) applyTheme(loadTheme())
})
const isThemesPage = window.location.pathname.replace(/\/+$/, '') === '/themes'
if (isThemesPage) document.title = 'Оформление · meme.cv'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isThemesPage ? <ThemePage /> : <App />}
  </StrictMode>,
)
