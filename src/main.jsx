import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './mobile.css'
import { initMobileSheetGestures } from './mobileSheetGestures'

// Arrastrar paneles en móvil: ↑ pantalla completa · ↓ reducir / cerrar
initMobileSheetGestures()

// App instalable: registra el service worker (solo en la web publicada, no en `npm run dev`)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const appLoader = document.getElementById('app-loader')
if (appLoader) {
  requestAnimationFrame(() => {
    const wait = Math.max(0, 700 - performance.now())
    setTimeout(() => {
      appLoader.classList.add('is-hidden')
      setTimeout(() => appLoader.remove(), 500)
    }, wait)
  })
}