import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'super_admin' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  registro: {
    logs: [] as unknown[],
    total: 0,
    isPending: false,
    error: null as unknown,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  },
  filtriChiesti: {} as Record<string, string>,
}))
vi.mock('../../src/hooks/useAuditLogs', () => ({
  AUDIT_WINDOW_SIZE: 200,
  useAuditLogs: (filtri: Record<string, string>) => {
    stato.filtriChiesti = filtri
    return stato.registro
  },
  useAuditActions: () => ({ data: [{ key: 'user.create', label: 'Utente creato' }] }),
}))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

import type { AuditLog } from '../../src/services/auditLogs'
import AuditLogsPage from '../../src/components/AuditLogsPage'

const riga = (over: Partial<AuditLog> = {}): AuditLog => ({
  id: 'log-1',
  created_at: '2026-03-01T10:00:00Z',
  user_id: 'u-1',
  user_email: 'anna@test.it',
  user_role: 'super_admin',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  action: 'user.create',
  action_label: 'Utente creato',
  resource_type: 'user',
  resource_id: 'u-2',
  method: 'POST',
  path: '/api/admin/users',
  status_code: 201,
  client_ip: '10.0.0.1',
  user_agent: 'Firefox',
  details: null,
  ...over,
})

function renderPage(over: Partial<typeof stato.registro> = {}) {
  Object.assign(stato.registro, over)
  render(<AuditLogsPage />)
}

beforeEach(() => {
  sessione.current = { ruolo: 'super_admin' }
  stato.registro = {
    logs: [riga()],
    total: 1,
    isPending: false,
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  }
  stato.filtriChiesti = {}
})

afterEach(() => {
  vi.useRealTimers()
})

describe('le righe del registro', () => {
  it('dicono chi ha fatto cosa, quando e come è andata', () => {
    renderPage()

    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
    expect(screen.getByText('Utente creato')).toBeInTheDocument()
    expect(screen.getByText('201')).toBeInTheDocument()
  })

  /* Il registro sopravvive agli account cancellati: l'email resta scritta
   * sulla riga, ed è l'unica cosa che la tiene leggibile. */
  it('resta leggibile anche su un account cancellato', () => {
    renderPage({ logs: [riga({ user_id: null, organization_name: null })] })

    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
  })

  it("riassume la riga con quello che l'endpoint ha allegato", () => {
    renderPage({ logs: [riga({ details: { email: 'marco@test.it', ruolo: 'user' } })] })

    expect(screen.getByText(/email: marco@test\.it/)).toHaveTextContent(/ruolo: user/)
  })

  it("senza dettagli ripiega sull'id della risorsa toccata", () => {
    renderPage()

    expect(screen.getByText('u-2')).toBeInTheDocument()
  })

  it('apre e richiude il dettaglio di una riga', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Utente creato'))
    expect(screen.getByText('POST /api/admin/users')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Utente creato'))
    expect(screen.queryByText('POST /api/admin/users')).not.toBeInTheDocument()
  })

  it('mostra i dettagli allegati nel riquadro aperto', async () => {
    renderPage({ logs: [riga({ details: { email: 'marco@test.it' } })] })

    await userEvent.click(screen.getByText('Utente creato'))

    expect(screen.getByText(/"email": "marco@test\.it"/)).toBeInTheDocument()
  })
})

describe('filtri', () => {
  it('filtra per azione', async () => {
    renderPage()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))

    expect(stato.filtriChiesti.action).toBe('user.create')
  })

  it('filtra per organizzazione', async () => {
    renderPage()

    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))

    expect(stato.filtriChiesti.organizationId).toBe('org-1')
  })

  /* "Azzera filtri" compare solo quando c'è qualcosa da azzerare: un
   * pulsante sempre acceso su una tabella intatta non fa niente. */
  it("offre di azzerare i filtri solo quando ce n'è uno", async () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Azzera filtri' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))

    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }))
    expect(stato.filtriChiesti.action).toBe('')
  })

  /* La ricerca interroga il server e non le sole righe già caricate: senza
   * il rinvio partirebbe una richiesta a ogni tasto premuto. */
  it('aspetta la fine della digitazione prima di cercare', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()

    await userEvent.type(screen.getByPlaceholderText(/Cerca per email/), 'anna')
    expect(stato.filtriChiesti.search).toBe('')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(stato.filtriChiesti.search).toBe('anna')
  })
})

describe('finestra e stati', () => {
  it('dice quante righe si stanno guardando sul totale', () => {
    renderPage({ logs: [riga(), riga({ id: 'log-2' })], total: 350 })

    expect(screen.getByText('2 di 350 azioni registrate')).toBeInTheDocument()
  })

  it('offre di caricare la finestra successiva', async () => {
    const fetchNextPage = vi.fn()
    renderPage({ hasNextPage: true, fetchNextPage, total: 350 })

    await userEvent.click(screen.getByRole('button', { name: /Carica/ }))

    expect(fetchNextPage).toHaveBeenCalledOnce()
  })

  it('non offre altre finestre quando il registro è tutto a schermo', () => {
    renderPage()

    expect(screen.queryByRole('button', { name: /Carica/ })).not.toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    renderPage({ isPending: true })

    expect(screen.getByText('Caricamento registro...')).toBeInTheDocument()
  })

  /* Un registro vuoto per davvero e uno svuotato dai filtri sono due cose
   * diverse: la seconda si risolve allargando i filtri, la prima no. */
  it('distingue un registro vuoto da una ricerca senza esiti', async () => {
    renderPage({ logs: [], total: 0 })
    expect(screen.getByText('Nessuna azione registrata.')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))
    expect(screen.getByText('Nessuna azione corrisponde ai filtri.')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    renderPage({ error: new Error('Sessione scaduta.') })

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    renderPage({ error: 'guasto' })

    expect(screen.getByText('Impossibile caricare il registro.')).toBeInTheDocument()
  })
})
