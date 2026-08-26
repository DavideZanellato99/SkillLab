import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({
  current: { ruolo: 'super_admin', organization_id: 'org-1' },
}))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  elenco: { data: [] as unknown[], isLoading: false },
}))
const elimina = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useSimulations', () => ({
  useAdminSimulations: () => stato.elenco,
  useDeleteSimulation: () => elimina,
}))
/* Come l'hook vero: senza `enabled` la chiamata non parte, e l'elenco resta
 * vuoto. È il caso dell'org admin, che le organizzazioni non le legge. */
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: (enabled = true) => ({
    data: enabled ? [{ id: 'org-1', name: 'Banca Esempio' }] : [],
  }),
}))

/* Le tre finestre di questa pagina hanno i loro test: qui conta quale si
 * apre, perché la matita e il clic sulla riga portano a due posti diversi. */
vi.mock('../../src/components/SimulationCreateModal', () => ({
  default: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <div>
      modulo di creazione
      <button onClick={() => onCreated('s-9')}>crea</button>
    </div>
  ),
}))
vi.mock('../../src/components/SimulationDetailModal', () => ({
  default: ({
    simulation,
    showOrganization,
  }: {
    simulation: { title: string; organization_name: string }
    showOrganization?: boolean
  }) => (
    <div>
      scheda: {simulation.title}
      {showOrganization && <span> di {simulation.organization_name}</span>}
    </div>
  ),
}))
vi.mock('../../src/components/SimulationEditorModal', () => ({
  default: ({ simulationId }: { simulationId: string }) => <div>pannello: {simulationId}</div>,
}))

import type { AdminSimulation } from '../../src/services/simulations'
import SimulationAdminPage from '../../src/components/SimulationAdminPage'

const simulazione = (over: Partial<AdminSimulation> = {}): AdminSimulation =>
  ({
    id: 's-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    title: 'Normativa antiriciclaggio',
    description: 'Le verifiche',
    status: 'published',
    kind: 'multiple',
    source: 'ai',
    document_name: 'normativa.pdf',
    question_count: 50,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    last_attempt_at: null,
    last_attempt_score: null,
    attempt_count: 0,
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  }) as AdminSimulation

function renderPage(righe: AdminSimulation[] = [simulazione()], ruolo = 'super_admin') {
  sessione.current = { ruolo, organization_id: 'org-1' }
  stato.elenco = { data: righe, isLoading: false }
  render(<SimulationAdminPage />)
}

beforeEach(() => {
  sessione.current = { ruolo: 'super_admin', organization_id: 'org-1' }
  elimina.mutate.mockReset()
  elimina.isPending = false
  elimina.isError = false
  elimina.error = null
})

describe('elenco', () => {
  it('mostra ogni simulazione con quello che la distingue', () => {
    renderPage()

    expect(screen.getByText('Normativa antiriciclaggio')).toBeInTheDocument()
    expect(screen.getByText('normativa.pdf')).toBeInTheDocument()
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('Pubblicata')).toBeInTheDocument()
  })

  /* Le bozze stanno in questa tabella e non in quella di chi svolge i test:
   * è qui che si vede la differenza fra un test pronto e uno in lavorazione. */
  it('mostra anche le bozze', () => {
    renderPage([simulazione({ status: 'draft', question_count: 0 })])

    expect(screen.getByText('Bozza')).toBeInTheDocument()
  })

  /* Che le domande siano scritte a mano lo dice la targhetta del tipo: il
   * documento sotto il titolo non c'è, e ripeterlo sarebbe la stessa cosa
   * due volte sulla stessa riga. */
  it('non scrive nessun documento sotto una simulazione redatta a mano', () => {
    renderPage([simulazione({ source: 'manual', document_name: '' })])

    expect(screen.queryByText('normativa.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('Manuale')).toBeInTheDocument()
  })

  it('cerca per titolo, organizzazione e documento', async () => {
    renderPage([
      simulazione(),
      simulazione({ id: 's-2', title: 'Privacy', document_name: 'gdpr.pdf' }),
    ])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per titolo/), 'gdpr')

    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.queryByText('Normativa antiriciclaggio')).not.toBeInTheDocument()
  })

  /* Il tipo e l'origine si cercano con le stesse parole che i badge
   * mostrano: chi legge "Manuale" sulla riga si aspetta di trovarla
   * scrivendo "manuale". */
  it('cerca anche con le parole delle targhette', async () => {
    renderPage([
      simulazione(),
      simulazione({ id: 's-2', title: 'Privacy', source: 'manual', kind: 'open' }),
    ])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per titolo/), 'manuale')

    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.queryByText('Normativa antiriciclaggio')).not.toBeInTheDocument()
  })

  it('distingue una tabella vuota da una ricerca senza esiti', async () => {
    renderPage([])
    expect(screen.getByText('Nessuna simulazione presente')).toBeInTheDocument()

    renderPage([simulazione()])
    await userEvent.type(screen.getAllByPlaceholderText(/Cerca per titolo/)[1], 'nessuna')
    expect(screen.getByText('Nessuna simulazione corrisponde alla ricerca')).toBeInTheDocument()
  })

  /* La domanda che si fa chi apre questa pagina è quali test siano rimasti a
     metà: la ricerca da sola non sa rispondere, perché «bozza» non è scritto
     da nessuna parte nella riga. */
  it('separa le bozze da finire dalle simulazioni pubblicate', async () => {
    renderPage([simulazione(), simulazione({ id: 's-2', title: 'Privacy', status: 'draft' })])

    await userEvent.click(screen.getByRole('radio', { name: 'Bozze' }))
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.queryByText('Normativa antiriciclaggio')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Pubblicate' }))
    expect(screen.getByText('Normativa antiriciclaggio')).toBeInTheDocument()
    expect(screen.queryByText('Privacy')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Tutte' }))
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText('Normativa antiriciclaggio')).toBeInTheDocument()
  })

  /* «Nessuna simulazione presente» sotto un filtro attivo farebbe credere
     che siano sparite. */
  it('dice quale filtro sta svuotando la tabella', async () => {
    renderPage([simulazione()])

    await userEvent.click(screen.getByRole('radio', { name: 'Bozze' }))

    expect(screen.getByText('Nessuna bozza da finire')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.elenco = { data: [], isLoading: true }
    render(<SimulationAdminPage />)

    expect(screen.getByText('Caricamento simulazioni...')).toBeInTheDocument()
  })

  it("mostra l'organizzazione al super admin", () => {
    renderPage()

    expect(screen.getByRole('columnheader', { name: 'Organizzazione' })).toBeInTheDocument()
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
  })

  /* Un org admin la sua organizzazione la conosce già: la colonna sarebbe la
   * stessa parola ripetuta su ogni riga. */
  it('toglie la colonna a un org admin', () => {
    renderPage([simulazione()], 'organization_admin')

    expect(screen.queryByRole('columnheader', { name: 'Organizzazione' })).not.toBeInTheDocument()
    expect(screen.queryByText('Banca Esempio')).not.toBeInTheDocument()
    expect(screen.getByText('Normativa antiriciclaggio')).toBeInTheDocument()
  })
})

describe('le due strade di una riga', () => {
  /* Il clic sulla riga apre la scheda in sola lettura, la matita il
   * pannello delle domande: modificare una simulazione vuol dire scriverle e
   * pubblicarle, non correggere un titolo in un modulo. */
  it('il clic sulla riga apre la scheda', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Normativa antiriciclaggio'))

    expect(screen.getByText('scheda: Normativa antiriciclaggio')).toBeInTheDocument()
  })

  /* Anche dentro la scheda: a chi ne amministra una sola l'organizzazione non
   * si ripete, come non si ripete in tabella. */
  it('non nomina l organizzazione nella scheda di un org admin', async () => {
    renderPage([simulazione()], 'organization_admin')

    await userEvent.click(screen.getByText('Normativa antiriciclaggio'))

    expect(screen.getByText(/^scheda:/)).toBeInTheDocument()
    expect(screen.queryByText(/Banca Esempio/)).not.toBeInTheDocument()
  })

  it('la matita apre il pannello delle domande', async () => {
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Modifica Normativa antiriciclaggio' }),
    )

    expect(screen.getByText('pannello: s-1')).toBeInTheDocument()
    expect(screen.queryByText(/^scheda:/)).not.toBeInTheDocument()
  })

  /* Una simulazione appena creata è vuota: portare subito al pannello delle
   * domande evita di doverla ritrovare in tabella per cominciare a
   * riempirla. */
  it('dopo la creazione porta dritto alle domande', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuova Simulazione/ }))
    await userEvent.click(screen.getByRole('button', { name: 'crea' }))

    expect(screen.queryByText('modulo di creazione')).not.toBeInTheDocument()
    expect(screen.getByText('pannello: s-9')).toBeInTheDocument()
  })
})

describe('eliminazione', () => {
  it('dice cosa sparisce e indica la strada che conserva i risultati', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Normativa antiriciclaggio' }))

    expect(screen.getByText(/tutti i tentativi già svolti/)).toBeInTheDocument()
    expect(screen.getByText(/ritirala invece di eliminarla/)).toBeInTheDocument()
  })

  it('elimina la simulazione confermata', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Normativa antiriciclaggio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(elimina.mutate).toHaveBeenCalledWith('s-1', expect.anything()))
  })

  /* Eliminare la simulazione che si sta rivedendo chiude anche il pannello:
   * resterebbe aperto su qualcosa che non esiste più. */
  it('chiude il pannello della simulazione eliminata', async () => {
    elimina.mutate.mockImplementation((_id: string, opzioni: { onSuccess: () => void }) =>
      opzioni.onSuccess(),
    )
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Modifica Normativa antiriciclaggio' }),
    )
    expect(screen.getByText('pannello: s-1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Normativa antiriciclaggio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina' }))

    await waitFor(() => expect(screen.queryByText('pannello: s-1')).not.toBeInTheDocument())
  })

  it('mostra il rifiuto del server senza chiudere la conferma', async () => {
    elimina.isError = true
    elimina.error = new Error('Simulazione in uso in un percorso.')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Normativa antiriciclaggio' }))

    expect(screen.getByText('Simulazione in uso in un percorso.')).toBeInTheDocument()
  })
})
