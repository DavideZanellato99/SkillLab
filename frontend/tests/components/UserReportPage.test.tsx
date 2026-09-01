import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'super_admin' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

const stato = vi.hoisted(() => ({
  report: {
    data: [] as unknown[],
    isPending: false,
    isPlaceholderData: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  chiesto: { organizationId: '', days: undefined as number | undefined },
  /* Le prove di una persona sono una lettura a parte, che parte quando la
   * riga si apre: qui è finta, e si guarda anche con che periodo arriva. */
  dettaglio: {
    data: undefined as unknown,
    isPending: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  dettaglioChiesto: { userId: '', days: undefined as number | undefined },
}))
vi.mock('../../src/hooks/useReports', () => ({
  useUsersReport: (organizationId: string, days: number | undefined) => {
    stato.chiesto = { organizationId, days }
    return stato.report
  },
  useUserReportDetail: (userId: string, days: number | undefined) => {
    stato.dettaglioChiesto = { userId, days }
    return stato.dettaglio
  },
}))

/* Le quattro finestre che questa pagina può aprire hanno i loro test: qui
 * conta quale si apre e con quali dati ci arriva. */
vi.mock('../../src/components/SimulationAttemptModal', () => ({
  default: ({ attemptId }: { attemptId: string }) => <div>tentativo: {attemptId}</div>,
}))
vi.mock('../../src/components/ConversationDetailModal', () => ({
  default: ({
    row,
    onReviewSaved,
  }: {
    row: { conversation_id: string; avatar_name: string }
    onReviewSaved?: () => void
  }) => (
    <div>
      conversazione: {row.conversation_id} con {row.avatar_name}
      <button onClick={() => onReviewSaved?.()}>salva revisione</button>
    </div>
  ),
}))
vi.mock('../../src/components/DeleteConversationDialog', () => ({
  default: ({ conversationId }: { conversationId: string }) => (
    <div>elimina conversazione: {conversationId}</div>
  ),
}))
vi.mock('../../src/components/DeleteAttemptDialog', () => ({
  default: ({ attemptId }: { attemptId: string }) => <div>elimina tentativo: {attemptId}</div>,
}))

import type { UserActivityReport } from '../../src/services/admin'
import UserReportPage from '../../src/components/UserReportPage'

const conversazione = {
  id: 'c-1',
  title: 'Reclamo sul rimborso',
  mode: 'text' as const,
  avatar_id: 'a-1',
  avatar_name: 'Anna Neri',
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  created_at: '2026-02-01T10:00:00Z',
  message_count: 12,
  duration_seconds: 600,
  score: 7.5,
}

const tentativo = {
  id: 't-1',
  simulation_id: 's-1',
  simulation_title: 'Procedure di sportello',
  simulation_kind: 'multiple' as const,
  simulation_source: 'ai' as const,
  created_at: '2026-02-02T10:00:00Z',
  correct_count: 8,
  question_count: 10,
  score: 6.5,
}

const riga = (over: Partial<UserActivityReport> = {}): UserActivityReport => ({
  id: 'u-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  ruolo: 'user',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  created_at: '2026-01-01T10:00:00Z',
  conversation_count: 1,
  total_duration_seconds: 600,
  simulation_count: 1,
  ...over,
})

/** Le prove che la lettura di dettaglio riporta quando la riga si apre. */
const prove = { conversations: [conversazione], simulation_attempts: [tentativo] }

function renderPage(righe: UserActivityReport[] = [riga()], ruolo = 'super_admin') {
  sessione.current = { ruolo }
  stato.report = { ...stato.report, data: righe }
  render(<UserReportPage />)
}

beforeEach(() => {
  stato.report = {
    data: [],
    isPending: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn(),
  }
  stato.chiesto = { organizationId: '', days: undefined }
  stato.dettaglio = { data: prove, isPending: false, error: null, refetch: vi.fn() }
  stato.dettaglioChiesto = { userId: '', days: undefined }
})

describe('la riga di una persona', () => {
  /* Le due prove stanno sulla stessa riga: chi ha svolto solo simulazioni,
   * con i soli conteggi delle conversazioni, sembrerebbe fermo. */
  it('conta entrambe le prove e la durata', () => {
    renderPage()

    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
    expect(screen.getAllByText('1')).toHaveLength(2)
    expect(screen.getByText('10 min 00 s')).toBeInTheDocument()
  })

  /* Come nella gestione utenti e nella tabella degli avatar: i valori della
   * colonna delle persone vanno a sinistra, mentre l'intestazione sopra resta
   * centrata come tutte le altre. Le altre celle della riga non seguono
   * l'eccezione. */
  it('allinea a sinistra la colonna delle persone, e solo quella', () => {
    renderPage()

    const celle = [...document.querySelectorAll('tbody td')]
    expect(celle[0].className).toContain('text-left')
    expect(celle[0].className).not.toContain('text-center')
    for (const cella of celle.slice(1)) expect(cella.className).toContain('text-center')
  })

  /* Zero è un trattino e non uno zero in evidenza: è un'assenza, e una
   * pastiglia con dentro uno zero pesa quanto una con dentro un numero. */
  it('mette un trattino dove una prova non è stata svolta', () => {
    renderPage([riga({ simulation_count: 0 })])

    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it("mostra l'organizzazione al super admin", () => {
    renderPage()

    expect(screen.getByText('Banca Esempio')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Organizzazione' })).toBeInTheDocument()
  })

  /* Un org admin la sua organizzazione la conosce già: la colonna sarebbe
   * la stessa parola ripetuta su ogni riga, e il filtro una tendina con
   * dentro una voce sola. */
  it('toglie la colonna e il filtro a un org admin', () => {
    renderPage([riga()], 'organization_admin')

    expect(screen.queryByRole('columnheader', { name: 'Organizzazione' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organizzazione')).not.toBeInTheDocument()
  })

  /* La ricerca aspetta la fine della digitazione: l'elenco è quello intero
   * di un tenant, e rifiltrarlo a ogni tasto vuol dire ridisegnare la
   * tabella mentre si sta ancora scrivendo. */
  it('cerca per nome, email, organizzazione e ruolo', async () => {
    renderPage([riga(), riga({ id: 'u-2', nome: 'Marco', cognome: 'Bianchi', email: 'm@test.it' })])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'bianchi')

    expect(await screen.findByText('Marco Bianchi')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument())
  })

  it('distingue una tabella vuota da una ricerca senza esiti', async () => {
    renderPage([])
    expect(screen.getByText('Nessun utente trovato')).toBeInTheDocument()

    renderPage([riga()])
    await userEvent.type(screen.getAllByPlaceholderText(/Cerca per nome/)[1], 'nessuno')
    expect(await screen.findByText('Nessun utente corrisponde alla ricerca')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.report = { ...stato.report, isPending: true }
    render(<UserReportPage />)

    expect(screen.getByText('Caricamento report attività...')).toBeInTheDocument()
  })

  /* Una lettura caduta non è un'organizzazione senza nessuno dentro: al
   * posto della tabella c'è il motivo, e il comando per richiederla. */
  it('riporta il motivo di un caricamento fallito, e lo si può riprovare', async () => {
    const refetch = vi.fn()
    stato.report = { ...stato.report, error: new Error('Sessione scaduta.'), refetch }
    render(<UserReportPage />)

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
    expect(screen.queryByText('Nessun utente trovato')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(refetch).toHaveBeenCalled()
  })

  /* Cambiando periodo le righe di prima restano, attenuate: al loro posto
   * c'era una rotella, cioè la pagina si svuotava di tabella, ricerca e
   * filtri a ogni cambio. */
  it('mentre arriva un altro periodo tiene le righe di prima, spente', () => {
    stato.report = { ...stato.report, isPlaceholderData: true }
    renderPage()

    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByRole('table').closest('[aria-busy="true"]')).not.toBeNull()
  })
})

describe('periodo e organizzazione', () => {
  it('parte da tutta la storia e da tutte le organizzazioni', () => {
    renderPage()

    expect(stato.chiesto).toEqual({ organizationId: '', days: undefined })
  })

  /* Il periodo restringe le prove agli ultimi giorni: "sempre" non è un
   * numero di giorni, e mandarlo come tale chiederebbe un periodo di zero. */
  it('traduce il periodo scelto in giorni', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))

    expect(stato.chiesto.days).toBe(30)
  })

  it('torna a tutta la storia', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Sempre' }))

    expect(stato.chiesto.days).toBeUndefined()
  })

  it("restringe il report a un'organizzazione", async () => {
    renderPage()

    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))

    expect(stato.chiesto.organizationId).toBe('org-1')
  })

  /* I due filtri stanno sotto l'intestazione, dove stanno in ogni altro
     elenco, e non più dentro la barra della tabella: da lì viene il pulsante
     che li azzera, che prima questa pagina non aveva.

     Azzerare comprende la ricerca: la casella resta nella tabella, ma
     restringe questo stesso elenco, e lasciarla scritta voleva dire premere
     il pulsante e vedere ancora un report filtrato. */
  it('azzera periodo, organizzazione e ricerca', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))
    await userEvent.click(screen.getByLabelText('Organizzazione'))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))
    const casella = screen.getByPlaceholderText(/Cerca per nome/)
    await userEvent.type(casella, 'anna')

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(stato.chiesto).toEqual({ organizationId: '', days: undefined })
    expect(casella).toHaveValue('')
  })
})

describe('storico di una persona', () => {
  it('resta chiuso finché non si apre la riga', () => {
    renderPage()

    expect(screen.queryByText('Reclamo sul rimborso')).not.toBeInTheDocument()
  })

  it('si apre e si richiude con un clic sulla riga', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Anna Rossi'))
    expect(screen.queryByText('Reclamo sul rimborso')).not.toBeInTheDocument()
  })

  /* Aprire la riga è l'unica cosa che questa pagina fa, e con il solo clic
   * chi gira con il tabulatore non aveva nessun modo di farlo: la freccia
   * in fondo alla riga è un disegno, non un comando. */
  it('si apre anche da tastiera, e lo dice a chi non la vede', async () => {
    renderPage()

    const riga = screen.getAllByRole('row').find((r) => within(r).queryByText('Anna Rossi'))
    expect(riga).toHaveAttribute('aria-expanded', 'false')

    riga?.focus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()
    expect(riga).toHaveAttribute('aria-expanded', 'true')
  })

  /* Le prove arrivano quando la riga si apre, e nel periodo che la pagina
   * sta guardando: la riga dice "una conversazione" e sotto se ne deve
   * aprire una. */
  it('chiede le prove della persona aperta, nel periodo scelto', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))
    await userEvent.click(screen.getByText('Anna Rossi'))

    expect(stato.dettaglioChiesto).toEqual({ userId: 'u-1', days: 30 })
  })

  /* Una persona alla volta: aprire la seconda chiude la prima, o la tabella
   * si allungherebbe fino a perdere di vista quello che si confrontava. */
  it('ne tiene aperta una sola', async () => {
    renderPage([riga(), riga({ id: 'u-2', nome: 'Marco', cognome: 'Bianchi' })])

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByText('Marco Bianchi'))

    expect(screen.getAllByText('Reclamo sul rimborso')).toHaveLength(1)
  })

  /* La modale della conversazione porta l'intestazione da qui, cioè chi ha
   * parlato con chi: il resto lo carica lei dall'id. */
  it('apre una conversazione con chi ha parlato con chi', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByText('Reclamo sul rimborso'))

    expect(screen.getByText('conversazione: c-1 con Anna Neri')).toBeInTheDocument()
  })

  it('apre un tentativo di simulazione', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByRole('radio', { name: /Simulazioni/ }))
    await userEvent.click(screen.getByText('Procedure di sportello'))

    expect(screen.getByText('tentativo: t-1')).toBeInTheDocument()
  })

  it('chiede conferma prima di buttare una conversazione', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Conversazione' }))

    expect(screen.getByText('elimina conversazione: c-1')).toBeInTheDocument()
  })

  it('chiede conferma prima di buttare un tentativo', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByRole('radio', { name: /Simulazioni/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina Tentativo' }))

    expect(screen.getByText('elimina tentativo: t-1')).toBeInTheDocument()
  })

  /* Correggere un voto invalida già i rendiconti da dentro la mutation, e
   * una query attiva invalidata si rilegge da sola: chiedere anche di qui
   * faceva partire due volte la lettura più pesante dell'applicazione. */
  it('non richiede il report dopo una revisione salvata', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByText('Reclamo sul rimborso'))
    await userEvent.click(screen.getByRole('button', { name: 'salva revisione' }))

    expect(stato.report.refetch).not.toHaveBeenCalled()
  })
})
