import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'
import App from './App.tsx'

/* Il default vale per le letture leggere: un minuto di validità, e al ritorno
 * sulla scheda si ricontrolla.
 *
 * Ricontrollare al focus serve perché quasi tutto quello che un admin guarda
 * lo cambia qualcun altro mentre la sua scheda è aperta (un docente pubblica
 * una revisione, uno studente chiude una conversazione), e perché certi stati
 * cambiano da soli col tempo: un percorso di training scade senza che nessuno
 * scriva niente, quindi nessuna invalidazione potrebbe accorgersene.
 *
 * Il costo lo governa `staleTime`, non questo interruttore: al focus riparte
 * solo ciò che è già scaduto. Le query che pesano se lo alzano nel proprio
 * hook, quelle che non cambiano mai lo mettono a Infinity. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
