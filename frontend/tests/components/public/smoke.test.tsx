/* Le cinque pagine pubbliche si aprono.
 *
 * È poco, ed è di proposito: quello che si rompe in silenzio qui non è il
 * testo, è il fatto che nessuno esce dalla propria sessione per guardare il
 * sito vetrina mentre lavora all'applicazione. Un import sbagliato in una di
 * queste pagine resterebbe lì per settimane senza che una schermata usata
 * ogni giorno se ne accorga. */

import { describe, it, beforeAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { Suspense, lazy } from 'react'

const PublicLayout = lazy(() => import('../../../src/components/public/PublicLayout'))
const PublicHome = lazy(() => import('../../../src/components/public/PublicHome'))
const PlatformPage = lazy(() => import('../../../src/components/public/PlatformPage'))
const RoleplayPage = lazy(() => import('../../../src/components/public/RoleplayPage'))
const SimulatorPage = lazy(() => import('../../../src/components/public/SimulatorPage'))
const EvaluationPage = lazy(() => import('../../../src/components/public/EvaluationPage'))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<div>loading</div>}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<PublicHome />} />
            <Route path="/piattaforma" element={<PlatformPage />} />
            <Route path="/roleplay" element={<RoleplayPage />} />
            <Route path="/simulatore" element={<SimulatorPage />} />
            <Route path="/valutazione" element={<EvaluationPage />} />
          </Route>
        </Routes>
      </Suspense>
    </MemoryRouter>,
  )
}

/* jsdom non sa scorrere una finestra che non disegna: senza questo, il
   ritorno in cima a ogni cambio di pagina riempie l'output di avvisi. */
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('sito pubblico', () => {
  it.each([
    ['/', 'Simulazioni realistiche per le conversazioni'],
    ['/piattaforma', 'Formazione conversazionale e'],
    ['/roleplay', 'Esercitazioni realistiche su'],
    ['/simulatore', 'Verifica delle conoscenze'],
    ['/valutazione', 'Punteggi motivati e'],
  ])('%s si apre', async (path, heading) => {
    const { unmount } = renderAt(path)
    /* Le pagine arrivano da un import dinamico, quindi l'attesa comprende il
       caricamento del modulo: con la suite intera in parallelo il secondo di
       default non basta sempre. */
    await screen.findByText(heading, { exact: false }, { timeout: 5000 })
    unmount()
  })
})
