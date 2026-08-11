import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { ruolo: 'super_admin' } }) }))

const stato = vi.hoisted(() => ({
  elenco: { data: [] as unknown[], isPending: false, error: null as unknown },
  dettaglio: { data: null as unknown, error: null as unknown },
  apertoInDettaglio: null as string | null,
}))
const mutazione = vi.hoisted(() => () => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const crea = vi.hoisted(() => mutazione())
const aggiorna = vi.hoisted(() => mutazione())
const cambiaStato = vi.hoisted(() => mutazione())
const elimina = vi.hoisted(() => mutazione())

vi.mock('../hooks/useOrganizations', () => ({
  useOrganizations: () => stato.elenco,
  useOrganization: (id: string | null) => {
    stato.apertoInDettaglio = id
    return stato.dettaglio
  },
  useCreateOrganization: () => crea,
  useUpdateOrganization: () => aggiorna,
  useSetOrganizationStatus: () => cambiaStato,
  useDeleteOrganization: () => elimina,
}))

import type { Organization } from '../services/organizations'
import OrganizationsPage from './OrganizationsPage'

const organizzazione = (over: Partial<Organization> = {}): Organization =>
  ({
    id: 'org-1',
    name: 'Banca Esempio',
    slug: 'banca-esempio',
    status: 'active',
    suspension_reason: null,
    user_count: 12,
    avatar_count: 4,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  }) as Organization

function renderPage(righe: Organization[] = [organizzazione()]) {
  stato.elenco = { data: righe, isPending: false, error: null }
  render(
    <MemoryRouter>
      <OrganizationsPage />
    </MemoryRouter>,
  )
}

/** Il pannello del dettaglio: le stesse parole stanno anche in tabella,
 *  quindi ogni asserzione va cercata dentro di lui. */
const dettaglio = () => screen.getByRole('button', { name: 'Chiudi dettaglio' }).parentElement!

function reimposta(m: ReturnType<typeof mutazione>, risposta: unknown) {
  m.mutateAsync.mockReset()
  m.mutateAsync.mockResolvedValue(risposta)
  m.reset.mockReset()
  m.isPending = false
  m.error = null
}

beforeEach(() => {
  stato.dettaglio = { data: null, error: null }
  stato.apertoInDettaglio = null
  reimposta(crea, organizzazione({ name: 'Acme' }))
  reimposta(aggiorna, organizzazione({ name: 'Banca Esempio SpA' }))
  reimposta(cambiaStato, organizzazione({ status: 'suspended' }))
  reimposta(elimina, { message: 'Organizzazione eliminata.', success: true })
})

describe('elenco', () => {
  it('mostra ogni organizzazione con i suoi conteggi', () => {
    renderPage()

    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
    expect(screen.getByText('banca-esempio')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Attiva')).toBeInTheDocument()
  })

  /* Il motivo della sospensione sta accanto allo stato che spiega: cercarlo
   * nel dettaglio vorrebbe dire aprire riga per riga per capire chi è
   * bloccato e perché. */
  it('scrive il motivo accanto a una sospensione', () => {
    renderPage([organizzazione({ status: 'suspended', suspension_reason: 'Contratto scaduto' })])

    expect(screen.getByText('Sospesa')).toBeInTheDocument()
    expect(screen.getByText('Contratto scaduto')).toBeInTheDocument()
  })

  it('filtra per stato', async () => {
    renderPage([
      organizzazione(),
      organizzazione({ id: 'org-2', name: 'Acme', slug: 'acme', status: 'suspended' }),
    ])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: 'Sospesa' }))

    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.queryByText('Banca Esempio')).not.toBeInTheDocument()
  })

  it('azzera il filtro di stato', async () => {
    renderPage([
      organizzazione(),
      organizzazione({ id: 'org-2', name: 'Acme', slug: 'acme', status: 'suspended' }),
    ])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: 'Sospesa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }))

    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
  })

  it('cerca per nome, slug e stato', async () => {
    renderPage([organizzazione(), organizzazione({ id: 'org-2', name: 'Acme', slug: 'acme-spa' })])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'acme-')

    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.queryByText('Banca Esempio')).not.toBeInTheDocument()
  })

  /* Una tabella vuota per davvero e una svuotata dai filtri sono due cose
   * diverse: la prima invita a creare la prima organizzazione, e su un
   * elenco filtrato sarebbe un consiglio sbagliato. */
  it("invita a creare la prima quando non ce n'è nessuna", () => {
    renderPage([])

    expect(screen.getByText(/Crea la prima con/)).toBeInTheDocument()
  })

  it('dice che sono i filtri a non trovare niente', async () => {
    renderPage([organizzazione()])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'nessuno')

    expect(screen.getByText('Nessuna organizzazione corrisponde ai filtri.')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.elenco = { data: [], isPending: true, error: null }
    render(
      <MemoryRouter>
        <OrganizationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Caricamento organizzazioni...')).toBeInTheDocument()
  })

  it("avvisa quando l'elenco non arriva", () => {
    stato.elenco = { data: [], isPending: false, error: new Error('403') }
    render(
      <MemoryRouter>
        <OrganizationsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Impossibile caricare le organizzazioni.')).toBeInTheDocument()
  })
})

describe('dettaglio', () => {
  it('si apre con un clic sulla riga e chiede le statistiche di quel tenant', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    expect(stato.apertoInDettaglio).toBe('org-1')
    expect(dettaglio()).toBeInTheDocument()
  })

  /* Le statistiche costano una scansione delle conversazioni e arrivano
   * dopo: nel frattempo il dettaglio mostra comunque i dati che la tabella
   * aveva già, invece di una modale vuota. */
  it('mostra subito i dati di tabella mentre le statistiche arrivano', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    const modale = dettaglio()
    expect(within(modale).getByText('org-1')).toBeInTheDocument()
    expect(within(modale).getByText('12')).toBeInTheDocument()
  })

  it('mostra le statistiche quando arrivano', async () => {
    stato.dettaglio = {
      data: {
        conversations_last_30_days: 8,
        conversations_total: 40,
        average_score: 7.25,
        evaluated_count: 6,
        last_login_at: null,
      },
      error: null,
    }
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    const modale = dettaglio()
    expect(within(modale).getByText('8')).toBeInTheDocument()
    expect(within(modale).getByText('su 40 totali')).toBeInTheDocument()
    expect(within(modale).getByText('7.3')).toBeInTheDocument()
    expect(within(modale).getByText(/su 6 conversazioni/)).toBeInTheDocument()
  })

  it('dice quando in quel tenant non si è ancora valutato niente', async () => {
    stato.dettaglio = {
      data: {
        conversations_last_30_days: 0,
        conversations_total: 0,
        average_score: null,
        evaluated_count: 0,
        last_login_at: null,
      },
      error: null,
    }
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    const modale = dettaglio()
    expect(within(modale).getByText('Nessuna valutazione')).toBeInTheDocument()
    expect(within(modale).getByText('Mai acceduto')).toBeInTheDocument()
  })

  /* Le statistiche mancanti non devono portarsi dietro il resto del
   * dettaglio: il tenant, i suoi conteggi e i salti alle altre pagine
   * restano leggibili. */
  it('regge statistiche non disponibili senza svuotare la modale', async () => {
    stato.dettaglio = { data: null, error: new Error('timeout') }
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    const modale = dettaglio()
    expect(within(modale).getAllByText('—').length).toBeGreaterThan(0)
    expect(within(modale).getByText('org-1')).toBeInTheDocument()
  })

  /* I salti alle altre pagine admin portano già il filtro addosso: senza,
   * si arriverebbe su un elenco di tutte le organizzazioni da rifiltrare. */
  it('porta agli elenchi già filtrati su quel tenant', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Banca Esempio'))

    const salti = within(dettaglio()).getAllByRole('link', { name: 'Apri elenco' })
    expect(salti[0]).toHaveAttribute('href', '/app/admin?organization_id=org-1')
    expect(salti[1]).toHaveAttribute('href', '/app/admin/avatars?organization_id=org-1')
  })
})

describe('creazione e modifica', () => {
  it('apre il modulo di creazione vuoto', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuova Organizzazione/ }))

    expect(screen.getByRole('heading', { name: 'Crea Nuova Organizzazione' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('')
  })

  it('crea passando solo il nome', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuova Organizzazione/ }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Acme')
    await userEvent.click(screen.getByRole('button', { name: 'Crea Organizzazione' }))

    await waitFor(() =>
      expect(crea.mutateAsync).toHaveBeenCalledWith({ name: 'Acme', slug: undefined }),
    )
    expect(await screen.findByText('Organizzazione Acme creata con successo.')).toBeInTheDocument()
  })

  /* Lo slug lasciato in bianco non viaggia come stringa vuota: è il server a
   * ricavarlo dal nome, e mandargliene uno vuoto lo farebbe rifiutare. */
  it('non manda uno slug fatto di soli spazi', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuova Organizzazione/ }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Acme')
    await userEvent.type(screen.getByLabelText('Slug (opzionale)'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Crea Organizzazione' }))

    await waitFor(() =>
      expect(crea.mutateAsync).toHaveBeenCalledWith({ name: 'Acme', slug: undefined }),
    )
  })

  it('apre la modifica con i dati della riga', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Banca Esempio' }))

    expect(screen.getByRole('heading', { name: 'Modifica Banca Esempio' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveValue('Banca Esempio')
    expect(screen.getByLabelText('Slug (opzionale)')).toHaveValue('banca-esempio')
  })

  it('salva la modifica sul tenant giusto', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Banca Esempio' }))
    await userEvent.type(screen.getByLabelText('Nome'), ' SpA')
    await userEvent.click(screen.getByRole('button', { name: 'Salva Modifiche' }))

    await waitFor(() =>
      expect(aggiorna.mutateAsync).toHaveBeenCalledWith({
        organizationId: 'org-1',
        payload: { name: 'Banca Esempio SpA', slug: 'banca-esempio' },
      }),
    )
  })

  /* Un salvataggio rifiutato lascia la modale aperta con dentro quello che
   * si stava scrivendo: chiuderla butterebbe via il modulo insieme
   * all'errore. */
  it('tiene aperto il modulo quando il salvataggio fallisce', async () => {
    crea.error = new Error('Slug già in uso.')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuova Organizzazione/ }))

    expect(screen.getByText('Slug già in uso.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toBeInTheDocument()
  })
})

describe('sospensione', () => {
  async function apriSospensione() {
    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per Banca Esempio' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Sospendi organizzazione/ }))
  }

  it('spiega cosa succede agli utenti del tenant', async () => {
    renderPage()

    await apriSospensione()

    expect(screen.getByText(/il login viene impedito/)).toBeInTheDocument()
  })

  /* Il motivo lo leggono gli utenti bloccati al posto del muro generico:
   * si scrive nel momento in cui si prende la decisione, non dopo. */
  it('manda il motivo insieme alla sospensione', async () => {
    renderPage()

    await apriSospensione()
    await userEvent.type(
      screen.getByLabelText(/Motivo \(opzionale, visibile agli utenti\)/),
      'Contratto scaduto',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sospendi' }))

    await waitFor(() =>
      expect(cambiaStato.mutateAsync).toHaveBeenCalledWith({
        organizationId: 'org-1',
        status: 'suspended',
        reason: 'Contratto scaduto',
      }),
    )
  })

  /* Riattivare non chiede nessun motivo: quello di prima lo cancella il
   * server, e un campo qui suggerirebbe che serva scriverne un altro. */
  it('riattiva senza chiedere nessun motivo', async () => {
    renderPage([organizzazione({ status: 'suspended', suspension_reason: 'Contratto scaduto' })])

    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per Banca Esempio' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Riattiva organizzazione/ }))

    expect(screen.queryByLabelText(/Motivo/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riattiva' }))

    await waitFor(() =>
      expect(cambiaStato.mutateAsync).toHaveBeenCalledWith({
        organizationId: 'org-1',
        status: 'active',
        reason: '',
      }),
    )
  })

  it('mostra il rifiuto del server nella conferma', async () => {
    cambiaStato.error = new Error('Operazione non permessa.')
    renderPage()

    await apriSospensione()

    expect(screen.getByText('Operazione non permessa.')).toBeInTheDocument()
  })
})

describe('eliminazione', () => {
  async function apriEliminazione() {
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Banca Esempio' }))
  }

  it('elenca cosa sparisce insieme al tenant', async () => {
    renderPage()

    await apriEliminazione()

    expect(screen.getByText('12 utenti')).toBeInTheDocument()
    expect(screen.getByText('4 avatar privati')).toBeInTheDocument()
    expect(screen.getByText(/non è reversibile/)).toBeInTheDocument()
  })

  /* La conferma chiede di riscrivere il nome: è l'unica azione dell'app che
   * porta via i dati di un'intera organizzazione, e un clic solo su un
   * pulsante rosso non basta a distinguerla da un clic sbagliato. */
  it('resta bloccata finché il nome non è riscritto', async () => {
    renderPage()

    await apriEliminazione()
    const conferma = screen.getByRole('button', { name: /Elimina Definitivamente/ })
    expect(conferma).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Banca Esempio'), 'Banca')
    expect(conferma).toBeDisabled()

    await userEvent.type(screen.getByPlaceholderText('Banca Esempio'), ' Esempio')
    expect(conferma).toBeEnabled()
  })

  it('elimina il tenant confermato', async () => {
    renderPage()

    await apriEliminazione()
    await userEvent.type(screen.getByPlaceholderText('Banca Esempio'), 'Banca Esempio')
    await userEvent.click(screen.getByRole('button', { name: /Elimina Definitivamente/ }))

    await waitFor(() => expect(elimina.mutateAsync).toHaveBeenCalledWith('org-1'))
    expect(await screen.findByText('Organizzazione eliminata.')).toBeInTheDocument()
  })

  it('mostra il rifiuto del server senza chiudere la conferma', async () => {
    elimina.error = new Error('Eliminazione non riuscita.')
    renderPage()

    await apriEliminazione()

    expect(screen.getByText('Eliminazione non riuscita.')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Banca Esempio')).toBeInTheDocument()
  })
})
