import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'super_admin' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  registro: {
    logs: [] as unknown[],
    total: 0,
    isPending: false,
    isPlaceholderData: false,
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
  created_at: '2026-03-01T10:00:00',
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

/** `quante` righe distinte, per le prove che riguardano lo sfogliare. */
const righe = (quante: number) =>
  Array.from({ length: quante }, (_, i) => riga({ id: `log-${i}`, resource_id: `u-${i}` }))

function renderPage(over: Partial<typeof stato.registro> = {}) {
  Object.assign(stato.registro, over)
  render(<AuditLogsPage />)
}

/** La riga della tabella che porta quel testo. */
const rigaDi = (testo: string) => screen.getByText(testo).closest('tr')!

beforeEach(() => {
  sessione.current = { ruolo: 'super_admin' }
  stato.registro = {
    logs: [riga()],
    total: 1,
    isPending: false,
    isPlaceholderData: false,
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

  /* Il momento arriva dal server senza fuso scritto ed è UTC: letto come ora
   * locale, il registro mostrava ogni azione spostata del fuso di chi
   * guardava, cioè due ore prima in estate, proprio nella schermata che esiste
   * per dire quando le cose sono successe. */
  it('mostrano il momento vero e non quello spostato dal fuso', () => {
    renderPage()

    const atteso = new Date('2026-03-01T10:00:00Z').toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    expect(screen.getByText(atteso)).toBeInTheDocument()
  })

  /* Il registro sopravvive agli account cancellati: l'email resta scritta
   * sulla riga, ed è l'unica cosa che la tiene leggibile. */
  it('resta leggibile anche su un account cancellato', () => {
    renderPage({ logs: [riga({ user_id: null, organization_name: null })] })

    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
  })

  it("riassume la riga con quello che l'endpoint ha allegato", () => {
    renderPage({ logs: [riga({ details: { email: 'marco@test.it', ruolo: 'user' } })] })

    expect(screen.getByText('marco@test.it')).toBeInTheDocument()
    expect(screen.getByText('user')).toBeInTheDocument()
  })

  /* Gli underscore delle chiavi sono un modo di scrivere per il codice: in
   * tabella "utenti_eliminati" si legge come una variabile, non come un
   * fatto. */
  it('scioglie gli underscore delle chiavi allegate', () => {
    renderPage({ logs: [riga({ details: { utenti_eliminati: 3 } })] })

    expect(screen.getByText(/utenti eliminati/)).toBeInTheDocument()
  })

  it("senza dettagli ripiega sull'id della risorsa toccata", () => {
    renderPage()

    expect(screen.getByText('u-2')).toBeInTheDocument()
  })

  it('spiega cosa vuol dire il codice della risposta', async () => {
    renderPage({ logs: [riga({ status_code: 403 })] })

    await userEvent.hover(screen.getByText('403'))

    expect(await screen.findByText(/Azione rifiutata/)).toBeInTheDocument()
  })
})

describe('il pannello di una riga', () => {
  it('si apre e si richiude col mouse', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Utente creato'))
    expect(screen.getByText('POST /api/admin/users')).toBeInTheDocument()
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Utente creato'))
    expect(screen.queryByText('POST /api/admin/users')).not.toBeInTheDocument()
  })

  /* Aprire la riga è l'unica cosa che si fa in questa pagina, e con il solo
   * clic chi gira con il tabulatore non aveva nessun modo di farlo. */
  it('si apre anche da tastiera', async () => {
    renderPage()

    const tr = rigaDi('Utente creato')
    tr.focus()
    expect(tr).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(screen.getByText('POST /api/admin/users')).toBeInTheDocument()
    expect(rigaDi('Utente creato')).toHaveAttribute('aria-expanded', 'true')
  })

  it('dice se è aperta a chi la pagina non la guarda', () => {
    renderPage()

    expect(rigaDi('Utente creato')).toHaveAttribute('aria-expanded', 'false')
  })

  it('mostra i dettagli allegati com’erano scritti', async () => {
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

  it('filtra per periodo', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Dal'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('Al'), { target: { value: '2026-03-03' } })

    expect(stato.filtriChiesti.dateFrom).toBe('2026-03-01')
    expect(stato.filtriChiesti.dateTo).toBe('2026-03-03')
  })

  /* Un intervallo rovesciato non è una domanda: i due estremi si limitano a
   * vicenda invece di lasciar comporre un periodo vuoto. */
  it('non lascia comporre un periodo alla rovescia', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Dal'), { target: { value: '2026-03-05' } })

    expect(screen.getByLabelText('Al')).toHaveAttribute('min', '2026-03-05')
    expect(screen.getByLabelText('Dal')).not.toHaveAttribute('max')
  })

  /* "Azzera Filtri" compare solo quando c'è qualcosa da azzerare: un
   * pulsante sempre acceso su una tabella intatta non fa niente. */
  it("offre di azzerare i filtri solo quando ce n'è uno", async () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    expect(stato.filtriChiesti.action).toBe('')
  })

  /* La ricerca è un filtro anche lei, benché la casella stia nella tabella:
   * azzerare senza comprenderla voleva dire premere il pulsante e continuare a
   * vedere un registro filtrato. */
  it('azzera anche la ricerca, e compare pure quando è l’unica scritta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()

    const casella = screen.getByPlaceholderText(/Cerca per email/)
    await userEvent.type(casella, 'anna')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(stato.filtriChiesti.search).toBe('anna')

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })

    expect(casella).toHaveValue('')
    expect(stato.filtriChiesti.search).toBe('')
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

  /* Restare alla terza pagina di una domanda a cui si è appena smesso di
   * rispondere non vuol dire niente. */
  it('riporta alla prima pagina quando cambia un filtro', async () => {
    renderPage({ logs: righe(25), total: 25 })

    await userEvent.click(screen.getByRole('button', { name: 'Pagina Successiva' }))
    expect(screen.getByText('Da 11 a 20 di 25')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))

    expect(screen.getByText('Da 1 a 10 di 25')).toBeInTheDocument()
  })
})

describe('finestra e stati', () => {
  /* Il conteggio sta dentro la scheda e solo finché c'è altro da scaricare:
   * quando il registro filtrato è tutto a schermo direbbe la stessa cosa della
   * barra per sfogliare, a un centimetro di distanza. */
  it('dice quante righe si stanno guardando sul totale', () => {
    renderPage({ logs: [riga(), riga({ id: 'log-2' })], total: 350, hasNextPage: true })

    expect(screen.getByText(/Caricate 2 azioni di 350/)).toBeInTheDocument()
  })

  it('dice che il totale è quello dei filtri, quando ce n’è uno', async () => {
    renderPage({ logs: [riga()], total: 350, hasNextPage: true })

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))

    expect(screen.getByText(/che corrispondono ai filtri/)).toBeInTheDocument()
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
    expect(screen.queryByText(/Caricate/)).not.toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    renderPage({ isPending: true })

    expect(screen.getByText('Caricamento registro...')).toBeInTheDocument()
  })

  /* Sostituire le righe col riquadro di caricamento faceva sparire la tabella
   * e saltare la pagina a ogni tasto premuto nella ricerca: restano quelle di
   * prima, attenuate, e `aria-busy` lo dice a chi la pagina non la guarda. */
  it('tiene le righe di prima mentre arriva la risposta a un filtro nuovo', () => {
    renderPage({ isPlaceholderData: true })

    expect(screen.getByText('Utente creato')).toBeInTheDocument()
    expect(screen.queryByText('Caricamento registro...')).not.toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  /* Un registro vuoto per davvero e uno svuotato dai filtri sono due cose
   * diverse: la seconda si risolve allargando i filtri, la prima no. */
  it('distingue un registro vuoto da una ricerca senza esiti', async () => {
    renderPage({ logs: [], total: 0 })
    expect(screen.getByText('Nessuna azione registrata')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Azione'))
    await userEvent.click(screen.getByRole('option', { name: 'Utente creato' }))
    expect(screen.getByText('Nessuna azione corrisponde ai filtri')).toBeInTheDocument()
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

describe('la tabella', () => {
  it('intesta le colonne del registro', () => {
    renderPage()

    const intestazione = within(screen.getAllByRole('rowgroup')[0])
    expect(intestazione.getByText('Data e Ora')).toBeInTheDocument()
    expect(intestazione.getByText('Esito')).toBeInTheDocument()
  })
})
