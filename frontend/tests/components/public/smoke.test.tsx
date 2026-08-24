/* La pagina pubblica si apre.
 *
 * È poco, ed è di proposito: quello che si rompe in silenzio qui non è il
 * testo, è il fatto che nessuno esce dalla propria sessione per guardare il
 * sito vetrina mentre lavora all'applicazione. Un import sbagliato resterebbe
 * lì per settimane senza che una schermata usata ogni giorno se ne accorga. */

import { describe, it, beforeAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import { Suspense, lazy } from 'react'

const PublicLayout = lazy(() => import('../../../src/components/public/PublicLayout'))
const PublicHome = lazy(() => import('../../../src/components/public/PublicHome'))

/* jsdom non sa scorrere una finestra che non disegna: senza questo, il
   ritorno in cima a ogni cambio di pagina riempie l'output di avvisi. */
beforeAll(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('sito pubblico', () => {
  it('la home si apre', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Suspense fallback={<div>loading</div>}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHome />} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>,
    )
    /* La pagina arriva da un import dinamico, quindi l'attesa comprende il
       caricamento del modulo: con la suite intera in parallelo il secondo di
       default non basta sempre. */
    await screen.findByText(
      'Simulazioni realistiche per le conversazioni',
      { exact: false },
      { timeout: 5000 },
    )
  })
})
