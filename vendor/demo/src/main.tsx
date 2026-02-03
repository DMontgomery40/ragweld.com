import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { SubtabErrorFallback } from '@/components/ui/SubtabErrorFallback'
// CSS MUST be loaded in exact order to match /gui for ADA compliance
import './styles/tokens.css'
import './styles/main.css' // Inline styles from /gui/index.html
// inline-gui-styles.css is intentionally not imported due to duplicate/invalid blocks.
import './styles/style.css'
import './styles/global.css'
import './styles/micro-interactions.css'
import './styles/storage-calculator.css'
import './styles/slider-polish.css' // Range input polish for onboarding sliders

// ragweld:demo:msw:start
async function enableMocking() {
  // Only enable MSW in demo mode
  if (!window.location.pathname.startsWith('/demo')) {
    return
  }

  const { worker } = await import('./mocks/browser')
  const { handlersFull, handlersPartial } = await import('./mocks/handlers')

  const params = new URLSearchParams(window.location.search || '')
  const forceMock = params.get('mock') === '1'

  // In default mode we only mock demo-only tabs; core RAG endpoints pass through to the real backend.
  worker.resetHandlers(...(forceMock ? handlersFull : handlersPartial))

  await worker.start({
    serviceWorker: {
      url: '/demo/mockServiceWorker.js',
    },
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
  console.log(`[MSW] Mock service worker started for demo mode (mode=${forceMock ? 'full' : 'partial'})`)
}
// ragweld:demo:msw:end

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename="/demo">
        <ErrorBoundary
          context="app-root"
          fallback={({ error, reset }) => (
            <div className="min-h-screen bg-bg p-6 text-fg">
              <SubtabErrorFallback
                title="Tri-Brid RAG failed to initialize"
                context="A fatal error occurred while bootstrapping the workspace."
                error={error}
                retryLabel="Reload application"
                onRetry={() => {
                  reset()
                  window.location.reload()
                }}
                className="mx-auto w-full max-w-3xl"
              />
            </div>
          )}
        >
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </React.StrictMode>,
  )
  
})
