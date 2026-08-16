import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { id: 'u-me', ruolo: 'super_admin' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

const stato = vi.hoisted(() => ({
  elenco: {
    users: [] as unknown[],
    total: 0,
    isPending: false,
    error: null as unknown,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  },
  filtriChiesti: {} as Record<string, unknown>,
}))
const mutazione = vi.hoisted(() => () => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const elimina = vi.hoisted(() => mutazione())
const rinvia = vi.hoisted(() => mutazione())
const cambiaStato = vi.hoisted(() => mutazione())

vi.mock('../../src/hooks/useAdminUsers', () => ({
  USERS_WINDOW_SIZE: 200,
  useAdminUsers: (filtri: Record<string, unknown>) => {
    stato.filtriChiesti = filtri
    return stato.elenco
  },
  useDeleteUser: () => elimina,
  useResendUserCredentials: () => rinvia,
  useSetUserStatus: () => cambiaStato,
}))

/* Le tre modali dell'anagrafica hanno i loro moduli e i loro test: qui
 * interessa quando la pagina le apre e cosa fa quando rispondono. */
vi.mock('../../src/components/UserCreateModal', () => ({
  default: ({ onCreated }: { onCreated: (u: { email: string }) => void }) => (
    <div>
      modulo di creazione
      <button onClick={() => onCreated({ email: 'nuovo@test.it' })}>crea</button>
    </div>
  ),
}))
vi.mock('../../src/components/UserEditModal', () => ({
  default: ({ onUpdated }: { onUpdated: (u: { email: string }) => void }) => (
    <div>
      modulo di modifica
      <button onClick={() => onUpdated({ email: 'anna@test.it' })}>salva</button>
    </div>
  ),
}))
vi.mock('../../src/components/UserDetailModal', () => ({
  default: () => <div>dettaglio utente</div>,
}))

import type { AdminUser } from '../../src/services/admin'
import AdminPage from '../../src/components/AdminPage'

const utente = (over: Partial<AdminUser> = {}): AdminUser =>
  ({
    id: 'u-1',
    cognito_sub: 'sub-1',
    email: 'anna@test.it',
    nome: 'Anna',
    cognome: 'Rossi',
    ruolo: 'user',
    status: 'active',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    last_login_at: '2026-03-01T10:00:00Z',
    last_activity_at: '2026-03-01T11:00:00Z',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
    created_by_email: 'sistema',
    updated_by_email: 'sistema',
    ...over,
  }) as AdminUser

function renderPage(
  percorso = '/app/admin',
  righe: AdminUser[] = [utente()],
  total = righe.length,
) {
  stato.elenco = { ...stato.elenco, users: righe, total }
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <AdminPage />
    </MemoryRouter>,
  )
}

function reimposta(m: ReturnType<typeof mutazione>, risposta: unknown) {
  m.mutateAsync.mockReset()
  m.mutateAsync.mockResolvedValue(risposta)
  m.reset.mockReset()
  m.isPending = false
  m.error = null
}

beforeEach(() => {
  sessione.current = { id: 'u-me', ruolo: 'super_admin' }
  stato.elenco = {
    users: [],
    total: 0,
    isPending: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  }
  stato.filtriChiesti = {}
  reimposta(elimina, { message: 'Utente eliminato.', success: true })
  reimposta(rinvia, { message: 'Credenziali inviate.', success: true })
  reimposta(cambiaStato, utente({ status: 'suspended' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('elenco', () => {
  it('mostra gli utenti trovati', () => {
    renderPage()

    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
  })

  it('dice quanti se ne stanno guardando sul totale', () => {
    renderPage('/app/admin', [utente(), utente({ id: 'u-2', email: 'marco@test.it' })], 350)

    expect(screen.getByText(/2 di 350 utenti/)).toBeInTheDocument()
  })

  /* Con dei filtri attivi il totale è quello dei filtri, non quello di
   * tutta l'anagrafica: senza dirlo, "2 di 350" farebbe pensare che manchino
   * 348 righe da caricare. */
  it('dice che il totale è quello dei filtri', async () => {
    stato.elenco.total = 5
    renderPage()

    await userEvent.click(screen.getByLabelText('Ruolo'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente' }))

    expect(screen.getByText(/che corrispondono ai filtri/)).toBeInTheDocument()
  })

  it('offre di caricare la finestra successiva', async () => {
    const fetchNextPage = vi.fn()
    stato.elenco = { ...stato.elenco, hasNextPage: true, fetchNextPage }
    renderPage('/app/admin', [utente()], 350)

    await userEvent.click(screen.getByRole('button', { name: /Carica altri 200/ }))

    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  /* L'ultima finestra è più corta del limite: offrire "carica altri 200"
   * quando ne restano nove prometterebbe righe che non esistono. */
  it('offre solo le righe che restano davvero', () => {
    stato.elenco = { ...stato.elenco, hasNextPage: true }
    renderPage('/app/admin', [utente()], 10)

    expect(screen.getByRole('button', { name: /Carica altri 9/ })).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.elenco = { ...stato.elenco, isPending: true }
    renderPage()

    expect(screen.getByText('Caricamento utenti del sistema...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    stato.elenco = { ...stato.elenco, error: new Error('Sessione scaduta.') }
    renderPage()

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it('distingue una tabella vuota da una ricerca senza esiti', async () => {
    renderPage('/app/admin', [])
    expect(screen.getByText('Nessun utente trovato.')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: 'Sospeso' }))
    expect(screen.getByText('Nessun utente corrisponde ai filtri.')).toBeInTheDocument()
  })
})

describe('filtri', () => {
  /* Il filtro organizzazione vive anche nell'indirizzo: è così che il
   * dettaglio di un'organizzazione può linkare "i suoi utenti", e un
   * ricaricamento riapre la pagina già filtrata. */
  it("parte filtrato quando l'indirizzo porta un'organizzazione", () => {
    renderPage('/app/admin?organization_id=org-1')

    expect(stato.filtriChiesti.organizationId).toBe('org-1')
  })

  it('traduce ogni filtro in quello che chiede al server', async () => {
    renderPage()

    await userEvent.click(screen.getByLabelText('Ruolo'))
    await userEvent.click(screen.getByRole('option', { name: 'Amministratore Organizzazione' }))
    await userEvent.click(screen.getByLabelText('Stato'))
    await userEvent.click(screen.getByRole('option', { name: 'Sospeso' }))

    expect(stato.filtriChiesti.ruolo).toBe('organization_admin')
    expect(stato.filtriChiesti.status).toBe('suspended')
  })

  /* "Mai entrato" ha tre valori e non due: nessun filtro, chi non è mai
   * entrato, e chi invece è già entrato. Il terzo è `false`, non l'assenza. */
  it('distingue "mai entrato" da "già entrato" e da nessun filtro', async () => {
    renderPage()
    expect(stato.filtriChiesti.neverLoggedIn).toBeUndefined()

    await userEvent.click(screen.getByLabelText('Accesso'))
    await userEvent.click(screen.getByRole('option', { name: 'Mai Acceduto' }))
    expect(stato.filtriChiesti.neverLoggedIn).toBe(true)

    await userEvent.click(screen.getByLabelText('Accesso'))
    await userEvent.click(screen.getByRole('option', { name: 'Ha Già Acceduto' }))
    expect(stato.filtriChiesti.neverLoggedIn).toBe(false)
  })

  it('azzera tutti i filtri insieme', async () => {
    renderPage('/app/admin?organization_id=org-1')

    await userEvent.click(screen.getByRole('button', { name: /Azzera Filtri/ }))

    expect(stato.filtriChiesti.organizationId).toBe('')
    expect(stato.filtriChiesti.ruolo).toBeUndefined()
  })

  /* La ricerca la applica il server a tutto l'elenco, non alle sole righe
   * caricate: aspetta che si smetta di scrivere per non chiedere una
   * finestra per ogni tasto. */
  it('aspetta la fine della digitazione prima di cercare', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'anna')
    expect(stato.filtriChiesti.search).toBe('')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(stato.filtriChiesti.search).toBe('anna')
  })
})

describe('azioni su una riga', () => {
  it('apre il dettaglio con un clic sulla riga', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))

    expect(screen.getByText('dettaglio utente')).toBeInTheDocument()
  })

  it('crea un utente e lo annuncia', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuovo Utente/ }))
    await userEvent.click(screen.getByRole('button', { name: 'crea' }))

    expect(screen.queryByText('modulo di creazione')).not.toBeInTheDocument()
    expect(screen.getByText(/Utente nuovo@test\.it creato con successo/)).toBeInTheDocument()
  })

  it('modifica un utente e lo annuncia', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica anna@test.it' }))
    await userEvent.click(screen.getByRole('button', { name: 'salva' }))

    expect(screen.queryByText('modulo di modifica')).not.toBeInTheDocument()
    expect(screen.getByText('Utente anna@test.it aggiornato con successo.')).toBeInTheDocument()
  })

  it('elimina un utente dopo la conferma', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina anna@test.it' }))
    expect(screen.getByText(/non è reversibile/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Elimina Definitivamente/ }))

    await waitFor(() => expect(elimina.mutateAsync).toHaveBeenCalledWith('u-1'))
    expect(await screen.findByText('Utente eliminato.')).toBeInTheDocument()
  })

  /* Una scrittura rifiutata lascia la conferma aperta con il motivo:
   * chiuderla farebbe credere che sia andata a buon fine. */
  it("tiene aperta la conferma quando l'eliminazione fallisce", async () => {
    elimina.error = new Error('Utente protetto.')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina anna@test.it' }))

    expect(screen.getByText('Utente protetto.')).toBeInTheDocument()
  })

  it('rinvia le credenziali spiegando cosa succede a quelle attuali', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per anna@test.it' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Rinvia Credenziali/ }))
    expect(screen.getByText(/cesseranno immediatamente di funzionare/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Invia Nuova Password' }))

    await waitFor(() => expect(rinvia.mutateAsync).toHaveBeenCalledWith('u-1'))
    expect(await screen.findByText('Credenziali inviate.')).toBeInTheDocument()
  })

  it('sospende un account dopo la conferma', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per anna@test.it' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Sospendi Account/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sospendi Account' }))

    await waitFor(() =>
      expect(cambiaStato.mutateAsync).toHaveBeenCalledWith({ userId: 'u-1', status: 'suspended' }),
    )
    expect(await screen.findByText(/sospeso/)).toBeInTheDocument()
  })

  /* Disabilitare è definitivo, sospendere no: sono due voci distinte, e la
   * seconda porta a una conferma che parla di un'operazione senza ritorno. */
  it('disabilita definitivamente da una voce sua', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per anna@test.it' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Disabilita Account/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Disabilita Definitivamente' }))

    await waitFor(() =>
      expect(cambiaStato.mutateAsync).toHaveBeenCalledWith({ userId: 'u-1', status: 'disabled' }),
    )
  })

  /* Sul proprio account le azioni di stato sono spente: ci si taglierebbe
   * fuori da soli, e il server le rifiuterebbe comunque. */
  it('non lascia toccare lo stato del proprio account', async () => {
    sessione.current = { id: 'u-1', ruolo: 'super_admin' }
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni per anna@test.it' }))

    // Spente entrambe, e ciascuna dice perché
    for (const voce of [/Sospendi Account/, /Disabilita Account/]) {
      expect(screen.getByRole('menuitem', { name: voce })).toBeDisabled()
      expect(screen.getByRole('menuitem', { name: voce })).toHaveTextContent(
        'Non puoi modificare lo stato del tuo stesso account',
      )
    }
  })
})
