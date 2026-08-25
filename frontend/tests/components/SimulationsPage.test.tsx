import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSimulations = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useSimulations', () => ({ useSimulations }))

const sessione = vi.hoisted(() => ({ current: { ruolo: 'user' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

import type { Simulation } from '../../src/services/simulations'
import SimulationsPage from '../../src/components/SimulationsPage'

const simulazione = (over: Partial<Simulation> = {}): Simulation => ({
  id: 's-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Normativa antiriciclaggio',
  description: 'Le verifiche da fare prima di aprire un rapporto',
  status: 'published',
  kind: 'multiple',
  source: 'ai',
  document_name: 'normativa.pdf',
  question_count: 10,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  last_attempt_at: null,
  last_attempt_score: null,
  attempt_count: 0,
  ...over,
})

function renderPage(stato: Record<string, unknown>, ruolo = 'user') {
  sessione.current = { ruolo }
  useSimulations.mockReturnValue({ isLoading: false, error: null, ...stato })
  render(
    <MemoryRouter>
      <SimulationsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessione.current = { ruolo: 'user' }
  useSimulations.mockReset()
})

describe('SimulationsPage', () => {
  it('presenta ogni test con quello che serve a decidere se cominciarlo', () => {
    renderPage({ data: [simulazione()] })

    expect(screen.getByRole('heading', { name: 'Normativa antiriciclaggio' })).toBeInTheDocument()
    expect(screen.getByText('10 domande')).toBeInTheDocument()
    expect(screen.getByText('scelta multipla')).toBeInTheDocument()
  })

  /* La riga sotto la descrizione dice cosa distingue un test dall'altro, e
   * per chi sta in una sola organizzazione il nome del tenant è la stessa
   * parola su ogni scheda. Lo legge il super admin, che è l'unico ad averne
   * davanti di più tenant insieme. */
  it("nomina l'organizzazione solo al super admin", () => {
    renderPage({ data: [simulazione()] })
    expect(screen.queryByText('Banca Esempio')).not.toBeInTheDocument()

    renderPage({ data: [simulazione()] }, 'organization_admin')
    expect(screen.queryByText('Banca Esempio')).not.toBeInTheDocument()

    renderPage({ data: [simulazione()] }, 'super_admin')
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
  })

  it('porta al test', () => {
    renderPage({ data: [simulazione()] })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/simulatore/s-1')
  })

  /* Un test mai svolto invita a iniziarlo e non mostra nessun voto: uno zero
   * al posto del voto assente direbbe che è andata malissimo. */
  it('un test mai svolto invita a iniziare, senza nessun voto', () => {
    renderPage({ data: [simulazione()] })

    expect(screen.getByText('Mai svolto')).toBeInTheDocument()
    expect(screen.getByText('Inizia')).toBeInTheDocument()
  })

  it("un test già svolto mostra l'ultimo voto e invita a riprovare", () => {
    renderPage({ data: [simulazione({ attempt_count: 3, last_attempt_score: 8 })] })

    expect(screen.getByText('Svolto 3 volte')).toBeInTheDocument()
    expect(screen.getByText('Riprova')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('usa il singolare per un test svolto una volta sola', () => {
    renderPage({ data: [simulazione({ attempt_count: 1, last_attempt_score: 6 })] })

    expect(screen.getByText('Svolto 1 volta')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    renderPage({ isLoading: true })

    expect(screen.getByText('Caricamento simulazioni...')).toBeInTheDocument()
  })

  /* L'elenco vuoto spiega perché è vuoto: le simulazioni le pubblica chi
   * gestisce la piattaforma, quindi non c'è niente da fare per riempirlo. */
  it('spiega un elenco vuoto', () => {
    renderPage({ data: [] })

    expect(screen.getByText('Nessuna simulazione disponibile')).toBeInTheDocument()
    expect(
      screen.getByText(/vengono pubblicate da chi gestisce la piattaforma/),
    ).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    renderPage({ data: [], error: new Error('Sessione scaduta.') })

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    renderPage({ data: [], error: 'guasto' })

    expect(screen.getByText('Errore nel caricamento delle simulazioni.')).toBeInTheDocument()
  })

  it('non lascia una riga vuota per un test senza descrizione', () => {
    renderPage({ data: [simulazione({ description: null })] })

    expect(screen.queryByText(/Le verifiche da fare/)).not.toBeInTheDocument()
  })

  /* Il voto dice com'è andata l'ultima prova, non se quell'ultima è di ieri
   * o di sei mesi fa: la distanza da adesso sta accanto al conteggio. */
  it("dice quanto tempo fa è stato svolto l'ultima volta", () => {
    renderPage({
      data: [
        simulazione({
          attempt_count: 2,
          last_attempt_score: 7,
          last_attempt_at: new Date().toISOString(),
        }),
      ],
    })

    expect(screen.getByText(/Svolto 2 volte, l'ultima oggi/)).toBeInTheDocument()
  })

  /* Con una decina di test pubblicati, "quali non ho ancora fatto" era una
   * domanda a cui si rispondeva leggendo la riga in fondo a ogni scheda. */
  describe('ricerca e filtri', () => {
    const mai = simulazione({ id: 'mai', title: 'Mai svolto' })
    const fatto = simulazione({ id: 'fatto', title: 'Già svolto', attempt_count: 1 })

    it('restringe alle sole prove ancora da svolgere', async () => {
      renderPage({ data: [mai, fatto] })

      await userEvent.click(screen.getByRole('radio', { name: 'Da svolgere' }))

      expect(screen.getByRole('heading', { name: 'Mai svolto' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Già svolto' })).not.toBeInTheDocument()
    })

    it('cerca fra i test a schermo', async () => {
      renderPage({ data: [mai, fatto] })

      await userEvent.type(screen.getByLabelText('Cerca un test tecnico'), 'già')

      expect(screen.getByRole('heading', { name: 'Già svolto' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Mai svolto' })).not.toBeInTheDocument()
    })

    /* Una pagina ristretta non deve sembrare guasta: il vuoto dice che a
       mancare sono i risultati della ricerca, non i test. */
    it('spiega un vuoto che viene dalla ricerca', async () => {
      renderPage({ data: [mai, fatto] })

      await userEvent.type(screen.getByLabelText('Cerca un test tecnico'), 'sportello')

      expect(screen.getByText('Nessun test corrisponde alla ricerca')).toBeInTheDocument()
      expect(screen.queryByText('Nessuna simulazione disponibile')).not.toBeInTheDocument()
    })

    /* Sopra un elenco vuoto sarebbe una casella che non trova mai niente. */
    it('non mostra la barra quando non c’è niente da restringere', () => {
      renderPage({ data: [] })

      expect(screen.queryByLabelText('Cerca un test tecnico')).not.toBeInTheDocument()
    })
  })
})
