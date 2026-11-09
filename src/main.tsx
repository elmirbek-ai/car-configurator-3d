/// <reference types="vite/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
const root = ReactDOM.createRoot(document.getElementById('root')!)
if (import.meta.env.DEV && window.location.pathname === '/camry-preview') {
  const CamryPreview = React.lazy(() => import('./CamryPreview'))
  root.render(<React.StrictMode><React.Suspense fallback={<p>Loading Camry preview…</p>}><CamryPreview /></React.Suspense></React.StrictMode>)
} else if (import.meta.env.DEV && window.location.pathname === '/camry-scene') {
  const CamryScene = React.lazy(() => import('./components/CamryScene'))
  root.render(<React.StrictMode><React.Suspense fallback={<p>Loading Camry scene…</p>}><CamryScene /></React.Suspense></React.StrictMode>)
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>)
}
