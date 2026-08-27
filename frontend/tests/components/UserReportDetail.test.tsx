import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ConversationReport,
  SimulationAttemptReport,
  UserActivityReport,
} from '../../src/services/admin'

/* Le due linguette dello storico di una persona.
 *
 * Quello che nessun altro può controllare al posto di questo componente è su
 * quale delle due si apre (chi ha solo svolto simulazioni deve trovarsi
 * davanti le proprie, non una linguetta vuota da cui indovinare che l'altra
 * non lo è) e che ogni riga si apra o si cancelli senza che i due gesti si
 * confondano.
 *
 * Le prove arrivano da una lettura sua, che parte quando la riga si apre: qui
 * è finta, e quello che conta è che le chieda per la persona giusta e nel
 * periodo che la pagina sta guardando. */

const lettura = vi.hoisted(() => ({
  stato: {
    data: undefined as { conversations: unknown[]; simulation_attempts: unknown[] } | undefined,
    isPending: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  chiesto: { userId: '', days: undefined as number | undefined },
}))

vi.mock('../../src/hooks/useReports', () => ({
  useUserReportDetail: (userId: string, days: number | undefined) => {
    lettura.chiesto = { userId, days }
    return lettura.stato
  },
}))

/* Il quadro d'insieme ha i suoi test: qui conta solo con che conto ci
 * arriva, perché è quello a decidere se il bottone si offre. */
vi.mock('../../src/components/UserDebriefingPanel', () => ({
  default: ({ evidenceCount }: { evidenceCount: number | null }) => (
    <div>quadro: {evidenceCount === null ? 'sconosciuto' : evidenceCount}</div>
  ),
}))

import UserReportDetail from '../../src/components/UserReportDetail'

/** Le prove che la lettura riporta, e la riga da cui si è aperta. */
interface Prove {
  conversations?: ConversationReport[]
  simulation_attempts?: SimulationAttemptReport[]
}

function report(over: Partial<UserActivityReport> & Prove = {}): UserActivityReport & Prove {
  return {
    id: 'u1',
    email: 'tizio@example.com',
    nome: 'Tizio',
    cognome: 'Rossi',
    ruolo: 'user',
    organization_id: 'org-1',
    organization_name: 'Organizzazione',
    created_at: '2026-01-01T10:00:00Z',
    conversation_count: over.conversations?.length ?? 0,
    total_duration_seconds: 0,
    simulation_count: over.simulation_attempts?.length ?? 0,
    ...over,
  }
}

const conversation = {
  id: 'c1',
  title: 'Reclamo sul rimborso',
  mode: 'text' as const,
  avatar_id: 'a1',
  avatar_name: 'Anna Neri',
  avatar_category: 'clienti',
  avatar_category_color: '#7c3aed',
  created_at: '2026-02-01T10:00:00Z',
  message_count: 12,
  duration_seconds: 600,
  score: 7.5,
}

const attempt = {
  id: 't1',
  simulation_id: 's1',
  simulation_title: 'Procedure di sportello',
  simulation_kind: 'multiple' as const,
  simulation_source: 'ai' as const,
  created_at: '2026-02-02T10:00:00Z',
  correct_count: 8,
  question_count: 10,
  score: 6.5,
}

function show(
  user: UserActivityReport & Prove,
  { days, evidenceCount = null }: { days?: number; evidenceCount?: number | null } = {},
) {
  const { conversations = [], simulation_attempts = [], ...riga } = user
  lettura.stato = { ...lettura.stato, data: { conversations, simulation_attempts } }

  const handlers = {
    onOpenConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onOpenAttempt: vi.fn(),
    onDeleteAttempt: vi.fn(),
  }
  render(<UserReportDetail user={riga} days={days} evidenceCount={evidenceCount} {...handlers} />)
  return handlers
}

beforeEach(() => {
  lettura.stato = { data: undefined, isPending: false, error: null, refetch: vi.fn() }
  lettura.chiesto = { userId: '', days: undefined }
})

describe('UserReportDetail', () => {
  it('si apre sulle conversazioni quando ce ne sono', () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()
    expect(screen.queryByText('Procedure di sportello')).not.toBeInTheDocument()
  })

  it('si apre sulle simulazioni quando le conversazioni non ci sono', () => {
    show(report({ simulation_attempts: [attempt] }))

    expect(screen.getByText('Procedure di sportello')).toBeInTheDocument()
    expect(screen.getByText('8/10')).toBeInTheDocument()
  })

  /* I numeri di una prova stanno in colonne con un'intestazione: "8/10" e
   * "12" senza una parola sopra sono due misure che si scambiano. */
  it('le colonne dicono cosa sono i numeri', () => {
    show(report({ conversations: [conversation] }))

    expect(screen.getByRole('columnheader', { name: 'Durata' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Voto' })).toBeInTheDocument()
  })

  it('il tipo del test è scritto per esteso, non solo nell icona', () => {
    show(report({ simulation_attempts: [attempt] }))

    // Dentro la tabella, non fra le voci del filtro che portano le stesse parole
    expect(within(screen.getByRole('table')).getByText('Scelta multipla')).toBeInTheDocument()
  })

  it('la linguetta porta il conteggio della propria prova', () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (1)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Simulazioni (1)' })).toBeInTheDocument()
  })

  it('si passa da una prova all altra', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByText('Procedure di sportello')).toBeInTheDocument()
    expect(screen.queryByText('Reclamo sul rimborso')).not.toBeInTheDocument()
  })

  it('una conversazione senza giudizio non mostra uno zero', () => {
    show(report({ conversations: [{ ...conversation, score: null }] }))

    expect(screen.getByText('n.d.')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  /* Aprire e cancellare sono due gesti sulla stessa riga, ed è esattamente
   * dove si confondono: il cestino non deve portare a leggere la prova, e
   * leggerla non deve cancellarla. */
  it('la conversazione si apre cliccandola e si cancella dal cestino', async () => {
    const handlers = show(report({ conversations: [conversation] }))

    await userEvent.click(screen.getByText('Reclamo sul rimborso'))
    expect(handlers.onOpenConversation).toHaveBeenCalledWith(conversation)
    expect(handlers.onDeleteConversation).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Conversazione' }))
    expect(handlers.onDeleteConversation).toHaveBeenCalledWith(conversation)
    expect(handlers.onOpenConversation).toHaveBeenCalledTimes(1)
  })

  /* Filtro e ricerca cambiano con la linguetta, ed è il punto in cui
   * potrebbero restare quelli dell'altra metà: al canale di una
   * conversazione un test non saprebbe rispondere. */
  it('il filtro nella barra della tabella è quello della prova attiva', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    expect(screen.getByRole('combobox', { name: 'Canale delle conversazioni' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Tipo delle simulazioni' })).toBeNull()

    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByRole('combobox', { name: 'Tipo delle simulazioni' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: 'Canale delle conversazioni' })).toBeNull()
  })

  it('il canale restringe le conversazioni', async () => {
    const chiamata = { ...conversation, id: 'c2', title: 'Preventivo', mode: 'voice' as const }
    show(report({ conversations: [conversation, chiamata] }))

    await userEvent.click(screen.getByRole('combobox', { name: 'Canale delle conversazioni' }))
    await userEvent.click(screen.getByRole('option', { name: 'Chiamate' }))

    expect(screen.getByText('Preventivo')).toBeInTheDocument()
    expect(screen.queryByText('Reclamo sul rimborso')).not.toBeInTheDocument()
  })

  /* Il conteggio deve dire cosa si sta guardando: un "2" accanto a una riga
   * sola si legge come un errore. */
  it('con un filtro attivo la linguetta dice quante ne restano sul totale', async () => {
    const chiamata = { ...conversation, id: 'c2', title: 'Preventivo', mode: 'voice' as const }
    show(report({ conversations: [conversation, chiamata] }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (2)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Canale delle conversazioni' }))
    await userEvent.click(screen.getByRole('option', { name: 'Chiamate' }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (1 di 2)' })).toBeInTheDocument()
  })

  it('il conteggio filtrato resta scritto anche sulla linguetta che non si guarda', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    await userEvent.type(screen.getByPlaceholderText(/Cerca per titolo, avatar/), 'preventivo')
    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Conversazioni (0 di 1)' })).toBeInTheDocument(),
    )
  })

  it('la ricerca guarda il titolo, e dice quando è lei a non lasciare niente', async () => {
    show(report({ conversations: [conversation] }))

    const box = screen.getByPlaceholderText(/Cerca per titolo, avatar/)

    await userEvent.type(box, 'rimb')
    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()

    await userEvent.clear(box)
    await userEvent.type(box, 'preventivo')
    await waitFor(() =>
      expect(screen.getByText('Nessuna conversazione con questi filtri')).toBeInTheDocument(),
    )
  })

  it('ogni prova tiene la propria ricerca, senza svuotare l altra', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    await userEvent.type(screen.getByPlaceholderText(/Cerca per titolo, avatar/), 'reclamo')
    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByText('Procedure di sportello')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Cerca per titolo o tipo/)).toHaveValue('')
  })

  it('anche la simulazione si apre e si cancella', async () => {
    const handlers = show(report({ simulation_attempts: [attempt] }))

    await userEvent.click(screen.getByText('Procedure di sportello'))
    expect(handlers.onOpenAttempt).toHaveBeenCalledWith(attempt.id)

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Tentativo' }))
    expect(handlers.onDeleteAttempt).toHaveBeenCalledWith(attempt)
    expect(handlers.onOpenAttempt).toHaveBeenCalledTimes(1)
  })

  /* Aprire la riga è l'unica cosa che la pagina fa, e con il solo clic chi
   * gira con il tabulatore non poteva farlo. Vale anche per queste righe,
   * che aprono la prova per intero. */
  it('la prova si apre anche da tastiera', async () => {
    const handlers = show(report({ conversations: [conversation] }))

    const riga = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('Reclamo sul rimborso'))
    riga?.focus()
    expect(riga).toHaveFocus()

    await userEvent.keyboard('{Enter}')
    expect(handlers.onOpenConversation).toHaveBeenCalledWith(conversation)
  })
})

describe('la lettura delle prove', () => {
  it('le chiede per questa persona e in questo periodo', () => {
    show(report({ conversations: [conversation] }), { days: 30 })

    expect(lettura.chiesto).toEqual({ userId: 'u1', days: 30 })
  })

  /* I conteggi la riga li ha già: aspettare la lettura per scriverli
   * vorrebbe dire partire da zero e saltare al valore vero sotto gli occhi
   * di chi guarda. */
  it('mentre carica, le linguette portano già i conteggi della riga', () => {
    lettura.stato = { ...lettura.stato, isPending: true }
    render(
      <UserReportDetail
        user={report({ conversation_count: 3, simulation_count: 2 })}
        evidenceCount={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onOpenAttempt={vi.fn()}
        onDeleteAttempt={vi.fn()}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Conversazioni (3)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Simulazioni (2)' })).toBeInTheDocument()
    expect(screen.getByText(/Caricamento delle prove svolte/)).toBeInTheDocument()
  })

  /* Una lettura caduta si rimedia restando dov'è: la riga è aperta, e
   * richiuderla e riaprirla non è un comando. */
  it('caduta, si può riprovare senza richiudere la riga', async () => {
    const refetch = vi.fn()
    lettura.stato = { data: undefined, isPending: false, error: new Error('Rete assente'), refetch }
    render(
      <UserReportDetail
        user={report()}
        evidenceCount={null}
        onOpenConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onOpenAttempt={vi.fn()}
        onDeleteAttempt={vi.fn()}
      />,
    )

    expect(screen.getByText('Rete assente')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(refetch).toHaveBeenCalled()
  })
})

describe("il conto delle prove per il quadro d'insieme", () => {
  /* Il quadro legge tutte le prove che esistono, il periodo restringe solo
   * quello che si sta guardando: passargli il conto di una settimana negava
   * il bottone a chi ne ha venti in un anno. */
  it('arriva da chi monta la schermata, e può essere sconosciuto', async () => {
    show(report({ conversations: [conversation] }), { evidenceCount: null })

    await userEvent.click(screen.getByRole('radio', { name: "Quadro d'insieme" }))

    expect(screen.getByText('quadro: sconosciuto')).toBeInTheDocument()
  })

  it('quando si sa, è quello che gli arriva', async () => {
    show(report({ conversations: [conversation] }), { evidenceCount: 7 })

    await userEvent.click(screen.getByRole('radio', { name: "Quadro d'insieme" }))

    expect(screen.getByText('quadro: 7')).toBeInTheDocument()
  })
})
