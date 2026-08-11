import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'super_admin' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

const stato = vi.hoisted(() => ({
  report: { data: [] as unknown[], isPending: false, error: null as unknown, refetch: vi.fn() },
  chiesto: { organizationId: '', days: undefined as number | undefined },
}))
vi.mock('../../src/hooks/useReports', () => ({
  useUsersReport: (organizationId: string, days: number | undefined) => {
    stato.chiesto = { organizationId, days }
    return stato.report
  },
}))

/* Le quattro finestre che questa pagina può aprire hanno i loro test: qui
 * conta quale si apre e con quali dati ci arriva. */
vi.mock('../../src/components/SimulationAttemptModal', () => ({
  default: ({ attemptId }: { attemptId: string }) => <div>tentativo: {attemptId}</div>,
}))
vi.mock('../../src/components/ConversationDetailModal', () => ({
  default: ({ row }: { row: { conversation_id: string; avatar_name: string } }) => (
    <div>
      conversazione: {row.conversation_id} con {row.avatar_name}
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
  conversations: [conversazione],
  simulation_attempts: [tentativo],
  ...over,
})

function renderPage(righe: UserActivityReport[] = [riga()], ruolo = 'super_admin') {
  sessione.current = { ruolo }
  stato.report = { ...stato.report, data: righe }
  render(<UserReportPage />)
}

beforeEach(() => {
  stato.report = { data: [], isPending: false, error: null, refetch: vi.fn() }
  stato.chiesto = { organizationId: '', days: undefined }
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

  /* Zero è un trattino e non uno zero in evidenza: è un'assenza, e una
   * pastiglia con dentro uno zero pesa quanto una con dentro un numero. */
  it('mette un trattino dove una prova non è stata svolta', () => {
    renderPage([riga({ simulation_count: 0, simulation_attempts: [] })])

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

  it('cerca per nome, email, organizzazione e ruolo', async () => {
    renderPage([riga(), riga({ id: 'u-2', nome: 'Marco', cognome: 'Bianchi', email: 'm@test.it' })])

    await userEvent.type(screen.getByPlaceholderText(/Cerca per nome/), 'bianchi')

    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  it('distingue una tabella vuota da una ricerca senza esiti', async () => {
    renderPage([])
    expect(screen.getByText('Nessun utente trovato')).toBeInTheDocument()

    renderPage([riga()])
    await userEvent.type(screen.getAllByPlaceholderText(/Cerca per nome/)[1], 'nessuno')
    expect(screen.getByText('Nessun utente corrisponde alla ricerca')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    stato.report = { ...stato.report, isPending: true }
    render(<UserReportPage />)

    expect(screen.getByText('Caricamento report attività...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    stato.report = { ...stato.report, error: new Error('Sessione scaduta.') }
    render(<UserReportPage />)

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Elimina conversazione' }))

    expect(screen.getByText('elimina conversazione: c-1')).toBeInTheDocument()
  })

  it('chiede conferma prima di buttare un tentativo', async () => {
    renderPage()

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByRole('radio', { name: /Simulazioni/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina tentativo' }))

    expect(screen.getByText('elimina tentativo: t-1')).toBeInTheDocument()
  })
})
