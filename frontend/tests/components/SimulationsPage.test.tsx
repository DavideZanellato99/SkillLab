import { render, screen, within } from '@testing-library/react'
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
  useSimulations.mockReturnValue({ isLoading: false, error: null, refetch: vi.fn(), ...stato })
  return render(
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

    /* Il tipo si legge dentro la scheda e non solo sulla pastiglia che
       restringe la griglia, che porta la stessa parola. */
    const scheda = within(screen.getByRole('link'))
    expect(screen.getByRole('heading', { name: 'Normativa antiriciclaggio' })).toBeInTheDocument()
    expect(scheda.getByText('10 domande')).toBeInTheDocument()
    expect(scheda.getByText('Scelta multipla')).toBeInTheDocument()
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

  it('un test mai svolto invita a iniziare', () => {
    renderPage({ data: [simulazione()] })

    expect(screen.getByText('Mai svolto')).toBeInTheDocument()
    expect(screen.getByText('Inizia')).toBeInTheDocument()
  })

  /* La tessera dice cos'è il test e cosa ci si è già fatto, non com'era
   * andata: il voto si legge dentro, dove si guarda una prova sola. */
  it('un test già svolto invita a riprovare, senza mostrare il voto', () => {
    renderPage({ data: [simulazione({ attempt_count: 3, last_attempt_score: 8 })] })

    expect(screen.getByText('3 svolgimenti')).toBeInTheDocument()
    expect(screen.getByText('Riprova')).toBeInTheDocument()
    expect(screen.queryByText('8')).not.toBeInTheDocument()
  })

  it('usa il singolare per un test svolto una volta sola', () => {
    renderPage({ data: [simulazione({ attempt_count: 1, last_attempt_score: 6 })] })

    expect(screen.getByText('1 svolgimento')).toBeInTheDocument()
  })

  it('mostra i segnaposto mentre i test arrivano', () => {
    const { container } = renderPage({ data: [], isLoading: true })

    expect(container.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(0)
  })

  /* L'elenco vuoto spiega perché è vuoto: i test li pubblica chi amministra,
   * quindi chi si allena non ha niente da fare per riempirlo, e chi
   * amministra ha il collegamento alla pagina dove si scrivono. */
  it('spiega un elenco vuoto', () => {
    renderPage({ data: [] })

    expect(screen.getByText('Nessun test tecnico è ancora stato pubblicato')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Vai alla gestione test' })).not.toBeInTheDocument()
  })

  it('su un elenco vuoto porta chi amministra alla gestione dei test', () => {
    renderPage({ data: [] }, 'organization_admin')

    expect(screen.getByRole('link', { name: 'Vai alla gestione test' })).toHaveAttribute(
      'href',
      '/app/admin/simulations',
    )
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
   * o di sei mesi fa: la data dell'ultimo svolgimento sta accanto al
   * conteggio, per esteso come sulla tessera dell'avatar. */
  it("dice quando è stato svolto l'ultima volta", () => {
    renderPage({
      data: [
        simulazione({
          attempt_count: 2,
          last_attempt_score: 7,
          last_attempt_at: '2026-08-13T09:30:00',
        }),
      ],
    })

    expect(screen.getByText('2 svolgimenti, ultimo il 13 ago 2026')).toBeInTheDocument()
  })

  /* Rispondere a dieci domande a crocette e scriverne dieci sono due impegni
   * che non si scambiano: chi apre la pagina sta decidendo quanto tempo ha
   * adesso, e le pastiglie sono i tipi di test. */
  describe('ricerca e filtri', () => {
    const mai = simulazione({ id: 'mai', title: 'Mai svolto' })
    const fatto = simulazione({ id: 'fatto', title: 'Già svolto', attempt_count: 1 })
    const aperta = simulazione({ id: 'aperta', title: 'Reclami scritti', kind: 'open' })

    it('restringe al tipo di test scelto', async () => {
      renderPage({ data: [mai, aperta] })

      await userEvent.click(screen.getByRole('radio', { name: /Risposta aperta/ }))

      expect(screen.getByRole('heading', { name: 'Reclami scritti' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Mai svolto' })).not.toBeInTheDocument()
    })

    /* Una pastiglia con lo zero accanto è un bottone che porta a una griglia
       vuota: in un catalogo di soli test a crocette sarebbero tre. */
    it('non offre i tipi che il catalogo non contiene', () => {
      renderPage({ data: [mai, aperta] })

      expect(screen.getByRole('radio', { name: /Tutti/ })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /Scelta multipla/ })).toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /Ordinamento/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /Abbinamento/ })).not.toBeInTheDocument()
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

      expect(screen.getByText('Nessun test corrisponde a questa ricerca')).toBeInTheDocument()
      expect(
        screen.queryByText('Nessun test tecnico è ancora stato pubblicato'),
      ).not.toBeInTheDocument()
    })

    /* Il vuoto si annulla dove si è, e il tipo scelto resta: il riquadro
       porge il gesto che toglie la ricerca, non tutto il resto insieme. */
    it('azzera la ricerca senza perdere il tipo scelto', async () => {
      renderPage({ data: [mai, aperta] })

      await userEvent.click(screen.getByRole('radio', { name: /Risposta aperta/ }))
      await userEvent.type(screen.getByLabelText('Cerca un test tecnico'), 'mai')
      expect(screen.getByText('Nessun test corrisponde a questa ricerca')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Azzera la ricerca' }))
      expect(screen.getByRole('heading', { name: 'Reclami scritti' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Mai svolto' })).not.toBeInTheDocument()
    })

    /* Sopra un elenco vuoto sarebbe una casella che non trova mai niente. */
    it('non mostra la barra quando non c’è niente da restringere', () => {
      renderPage({ data: [] })

      expect(screen.queryByLabelText('Cerca un test tecnico')).not.toBeInTheDocument()
    })
  })
})
