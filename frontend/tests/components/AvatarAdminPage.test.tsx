import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: { ruolo: 'super_admin' } }) }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({
    data: [
      { id: 'org-1', name: 'Banca Esempio' },
      { id: 'org-2', name: 'Acme' },
    ],
  }),
}))

const stato = vi.hoisted(() => ({
  catalogo: { data: [] as unknown[], isPending: false, error: null as unknown },
  chiesto: { includeDeleted: null as boolean | null },
}))
const elimina = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const ripristina = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  variables: undefined as string | undefined,
}))
vi.mock('../../src/hooks/useAdminAvatars', () => ({
  useAdminAvatars: (includeDeleted: boolean) => {
    stato.chiesto.includeDeleted = includeDeleted
    return stato.catalogo
  },
  useDeleteAvatar: () => elimina,
  useRestoreAvatar: () => ripristina,
}))

vi.mock('../../src/components/AvatarFormModal', () => ({
  default: ({ target, onSaved }: { target: unknown; onSaved: (m: string) => void }) => (
    <div>
      scheda: {target === 'new' ? 'nuovo avatar' : (target as { name: string }).name}
      <button onClick={() => onSaved('Avatar salvato.')}>salva</button>
    </div>
  ),
}))
vi.mock('../../src/components/AvatarDetailModal', () => ({
  default: ({ avatar, onEdit }: { avatar: { name: string }; onEdit?: () => void }) => (
    <div>
      dettaglio: {avatar.name}
      {onEdit && <button onClick={onEdit}>modifica dal dettaglio</button>}
    </div>
  ),
}))
vi.mock('../../src/components/AvatarCategoriesModal', () => ({
  default: ({ organizationId }: { organizationId?: string }) => (
    <div>categorie: {organizationId ?? 'tutte'}</div>
  ),
}))

import type { AdminAvatar } from '../../src/services/admin'
import AvatarAdminPage from '../../src/components/AvatarAdminPage'

const avatar = (over: Partial<AdminAvatar> = {}): AdminAvatar =>
  ({
    id: 'a-1',
    name: 'Cliente arrabbiato',
    image_url: '/static/avatars/a-1.png',
    category: 'Clienti',
    category_id: 'cat-1',
    category_color: 'violet',
    description: 'Chiama per un addebito',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    conversation_count: 12,
    deleted_at: null,
    profile: {},
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  }) as AdminAvatar

const archiviato = (over: Partial<AdminAvatar> = {}) =>
  avatar({
    id: 'a-9',
    name: 'Cliente storico',
    deleted_at: '2026-02-01T10:00:00Z',
    ...over,
  })

function renderPage(righe: AdminAvatar[] = [avatar()], percorso = '/app/admin/avatars') {
  stato.catalogo = { data: righe, isPending: false, error: null }
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <AvatarAdminPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  stato.chiesto.includeDeleted = null
  elimina.mutateAsync.mockReset()
  elimina.mutateAsync.mockResolvedValue({ message: 'Avatar archiviato.', success: true })
  elimina.reset.mockReset()
  elimina.isPending = false
  elimina.error = null
  ripristina.mutateAsync.mockReset()
  ripristina.mutateAsync.mockResolvedValue(avatar({ name: 'Cliente storico' }))
  ripristina.isPending = false
  ripristina.variables = undefined
})

describe('catalogo', () => {
  it('mostra gli avatar in catalogo', () => {
    renderPage()

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
  })

  /* Gli archiviati arrivano insieme agli altri e li nasconde il filtro: sono
   * una vista di questa stessa tabella, non un elenco separato da chiedere
   * a parte. */
  it('chiede al server anche gli archiviati', () => {
    renderPage()

    expect(stato.chiesto.includeDeleted).toBe(true)
  })

  it('parte dal catalogo, senza gli archiviati', () => {
    renderPage([avatar(), archiviato()])

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.queryByText('Cliente storico')).not.toBeInTheDocument()
  })

  it('mostra gli archiviati quando si chiedono', async () => {
    renderPage([avatar(), archiviato()])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))

    expect(screen.getByText('Cliente storico')).toBeInTheDocument()
    expect(screen.queryByText('Cliente arrabbiato')).not.toBeInTheDocument()
  })

  /* Il contatore sulla voce dice quanti ce ne sono senza doverci entrare:
   * un archivio vuoto e uno con dentro trenta avatar si distinguono prima
   * di cambiare vista. */
  it('conta gli archiviati sulla voce del filtro', async () => {
    renderPage([avatar(), archiviato(), archiviato({ id: 'a-10' })])

    await userEvent.click(screen.getByLabelText('Stato'))

    expect(screen.getByRole('option', { name: 'Archiviati (2)' })).toBeInTheDocument()
  })

  it('filtra per organizzazione', async () => {
    renderPage([
      avatar(),
      avatar({ id: 'a-2', name: 'Collega scettico', organization_id: 'org-2' }),
    ])

    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Acme' }))

    expect(screen.getByText('Collega scettico')).toBeInTheDocument()
    expect(screen.queryByText('Cliente arrabbiato')).not.toBeInTheDocument()
  })

  /* Il filtro organizzazione vive anche nell'indirizzo: il dettaglio di
   * un'organizzazione linka qui per i suoi avatar, e ricaricando la pagina
   * resta filtrata. */
  it("parte filtrato quando l'indirizzo porta un'organizzazione", () => {
    renderPage(
      [avatar(), avatar({ id: 'a-2', name: 'Collega scettico', organization_id: 'org-2' })],
      '/app/admin/avatars?organization_id=org-2',
    )

    expect(screen.getByText('Collega scettico')).toBeInTheDocument()
    expect(screen.queryByText('Cliente arrabbiato')).not.toBeInTheDocument()
  })

  /* Il contatore segue il filtro organizzazione: un totale di tutti i tenant
   * accanto a una tabella che ne mostra uno solo è un numero che non torna
   * con le righe che compaiono scegliendolo. */
  it("conta gli archiviati dentro l'organizzazione filtrata", async () => {
    renderPage([
      avatar(),
      archiviato(),
      archiviato({ id: 'a-10', name: 'Altrove', organization_id: 'org-2' }),
    ])

    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))
    await userEvent.click(screen.getByLabelText('Stato'))

    expect(screen.getByRole('option', { name: 'Archiviati (1)' })).toBeInTheDocument()
  })

  it('azzera i filtri riportando al catalogo', async () => {
    renderPage([avatar(), archiviato()])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
  })

  /* La ricerca è un filtro come gli altri: se il bottone che li azzera la
   * lascia dov'è, la tabella resta ristretta dopo averlo premuto. */
  it('azzera anche la ricerca', async () => {
    renderPage([avatar(), avatar({ id: 'a-2', name: 'Collega scettico' })])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'collega')
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Cerca per nome/)).toHaveValue('')
  })

  /* Con la sola ricerca attiva il bottone c'era da nascondere: spariva
   * lasciando una tabella filtrata e nessun modo evidente di tornare
   * indietro. */
  it('offre di azzerare anche quando a filtrare è solo la ricerca', async () => {
    renderPage()

    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'cli')

    expect(screen.getByRole('button', { name: 'Azzera Filtri' })).toBeInTheDocument()
  })

  it('cerca per nome e categoria', async () => {
    renderPage([avatar(), avatar({ id: 'a-2', name: 'Collega scettico', category: 'Colleghi' })])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'colleghi')

    expect(screen.getByText('Collega scettico')).toBeInTheDocument()
    expect(screen.queryByText('Cliente arrabbiato')).not.toBeInTheDocument()
  })

  /* Un archivio vuoto spiega cosa ci finirebbe dentro, invece di dire solo
   * che non c'è niente: è una vista in cui si entra apposta. */
  it('spiega un archivio vuoto', async () => {
    renderPage([avatar()])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))

    expect(screen.getByText(/Gli avatar eliminati vengono raccolti qui/)).toBeInTheDocument()
  })

  it('invita a creare il primo su un catalogo vuoto', () => {
    renderPage([])

    expect(screen.getByText(/Crea il primo con/)).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.catalogo = { data: [], isPending: true, error: null }
    render(
      <MemoryRouter>
        <AvatarAdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Caricamento avatar...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    stato.catalogo = { data: [], isPending: false, error: new Error('Sessione scaduta.') }
    render(
      <MemoryRouter>
        <AvatarAdminPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })
})

describe('scheda persona', () => {
  it('apre il dettaglio con un clic sulla riga', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Cliente arrabbiato'))

    expect(screen.getByText('dettaglio: Cliente arrabbiato')).toBeInTheDocument()
  })

  it('apre la scheda vuota per un avatar nuovo', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuovo Avatar/ }))

    expect(screen.getByText('scheda: nuovo avatar')).toBeInTheDocument()
  })

  /* Dal dettaglio si passa alla modifica senza richiudere e ricercare la
   * riga, che nel frattempo può essere finita sotto un filtro o su un'altra
   * pagina. Il dettaglio si chiude: due modali sullo stesso avatar, una
   * sopra l'altra, sarebbero due volte la stessa cosa. */
  it('dal dettaglio si passa alla scheda modificabile', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Cliente arrabbiato'))
    await userEvent.click(screen.getByRole('button', { name: 'modifica dal dettaglio' }))

    expect(screen.getByText('scheda: Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.queryByText('dettaglio: Cliente arrabbiato')).not.toBeInTheDocument()
  })

  it("la matita apre la scheda di quell'avatar", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Cliente arrabbiato' }))

    expect(screen.getByText('scheda: Cliente arrabbiato')).toBeInTheDocument()
  })

  /* Un avatar nuovo nasce in catalogo: se la tabella stava mostrando
   * l'archivio, tornarci sopra lo farebbe comparire dove non è, quindi la
   * vista torna al catalogo. */
  it("dopo aver creato torna al catalogo se si stava guardando l'archivio", async () => {
    renderPage([avatar(), archiviato()])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))
    await userEvent.click(screen.getByRole('button', { name: /Nuovo Avatar/ }))
    await userEvent.click(screen.getByRole('button', { name: 'salva' }))

    expect(screen.getByText('Cliente arrabbiato')).toBeInTheDocument()
    expect(screen.getByText('Avatar salvato.')).toBeInTheDocument()
  })

  it("apre l'anagrafica delle categorie dalla testata", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Categorie' }))

    expect(screen.getByText('categorie: tutte')).toBeInTheDocument()
  })

  /* Aprendo le categorie con un'organizzazione già scelta, l'anagrafica
   * parte da quella: è quella di cui si stanno guardando gli avatar. */
  it("le categorie partono dall'organizzazione filtrata", async () => {
    renderPage([avatar()], '/app/admin/avatars?organization_id=org-1')

    await userEvent.click(screen.getByRole('button', { name: 'Categorie' }))

    expect(screen.getByText('categorie: org-1')).toBeInTheDocument()
  })
})

describe('archiviazione e ripristino', () => {
  /* L'eliminazione è logica, e dirlo nella conferma evita che sembri una
   * cancellazione di dati e che l'admin si fermi per paura. */
  it('spiega che le conversazioni già svolte restano', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Cliente arrabbiato' }))

    expect(screen.getByText('12 conversazioni')).toBeInTheDocument()
    expect(
      screen.getByText(/restano intatte e continuano a comparire nei report/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Puoi ripristinare l'avatar in qualsiasi momento/)).toBeInTheDocument()
  })

  it('su un avatar mai usato dice che non si cancella niente', async () => {
    renderPage([avatar({ conversation_count: 0 })])

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Cliente arrabbiato' }))

    expect(screen.getByText(/Nessun dato viene cancellato/)).toBeInTheDocument()
  })

  it("archivia l'avatar confermato", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Cliente arrabbiato' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Avatar' }))

    await waitFor(() => expect(elimina.mutateAsync).toHaveBeenCalledWith('a-1'))
    expect(await screen.findByText('Avatar archiviato.')).toBeInTheDocument()
  })

  it('mostra il rifiuto del server senza chiudere la conferma', async () => {
    elimina.error = new Error('Archiviazione non riuscita.')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Cliente arrabbiato' }))

    expect(screen.getByText('Archiviazione non riuscita.')).toBeInTheDocument()
  })

  it('riporta in catalogo un avatar archiviato', async () => {
    renderPage([archiviato()])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Ripristina Cliente storico' }))

    await waitFor(() => expect(ripristina.mutateAsync).toHaveBeenCalledWith('a-9'))
    expect(await screen.findByText(/ripristinato: è di nuovo in catalogo/)).toBeInTheDocument()
  })

  /* Il ripristino in corso blocca solo la riga che si sta ripristinando: un
   * flag condiviso spegnerebbe tutte le righe dell'archivio insieme. */
  it('blocca solo la riga in corso di ripristino', async () => {
    ripristina.isPending = true
    ripristina.variables = 'a-9'
    renderPage([archiviato(), archiviato({ id: 'a-10', name: 'Cliente antico' })])

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: /Archiviati/ }))

    expect(screen.getByRole('button', { name: 'Ripristina Cliente storico' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Ripristina Cliente antico' })).toBeEnabled()
  })
})
