import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import UserReportDetail from '../../src/components/UserReportDetail'
import type { UserActivityReport } from '../../src/services/admin'

/* Le due linguette dello storico di una persona.
 *
 * Quello che nessun altro può controllare al posto di questo componente è su
 * quale delle due si apre (chi ha solo svolto simulazioni deve trovarsi
 * davanti le proprie, non una linguetta vuota da cui indovinare che l'altra
 * non lo è) e che ogni riga si apra o si cancelli senza che i due gesti si
 * confondano. */

function report(over: Partial<UserActivityReport> = {}): UserActivityReport {
  return {
    id: 'u1',
    email: 'tizio@example.com',
    nome: 'Tizio',
    cognome: 'Rossi',
    ruolo: 'user',
    organization_id: 'org-1',
    organization_name: 'Organizzazione',
    created_at: '2026-01-01T10:00:00Z',
    conversation_count: 0,
    total_duration_seconds: 0,
    simulation_count: 0,
    conversations: [],
    simulation_attempts: [],
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

function show(user: UserActivityReport) {
  const handlers = {
    onOpenConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onOpenAttempt: vi.fn(),
    onDeleteAttempt: vi.fn(),
  }
  render(<UserReportDetail user={user} {...handlers} />)
  return handlers
}

describe('UserReportDetail', () => {
  it('si apre sulle conversazioni quando ce ne sono', () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()
    expect(screen.queryByText('Procedure di sportello')).not.toBeInTheDocument()
  })

  it('si apre sulle simulazioni quando le conversazioni non ci sono', () => {
    show(report({ simulation_attempts: [attempt] }))

    expect(screen.getByText('Procedure di sportello')).toBeInTheDocument()
    expect(screen.getByText('8/10 corrette')).toBeInTheDocument()
  })

  it('il tipo del test è scritto per esteso, non solo nell icona', () => {
    show(report({ simulation_attempts: [attempt] }))

    // Dentro la lista, non fra i pulsanti del filtro che portano le stesse parole
    expect(within(screen.getByRole('list')).getByText('Scelta multipla')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: 'Elimina conversazione' }))
    expect(handlers.onDeleteConversation).toHaveBeenCalledWith(conversation)
    expect(handlers.onOpenConversation).toHaveBeenCalledTimes(1)
  })

  /* Filtro e ricerca cambiano con la linguetta, ed è il punto in cui
   * potrebbero restare quelli dell'altra metà: al canale di una
   * conversazione un test non saprebbe rispondere. */
  it('il filtro accanto alle linguette è quello della prova attiva', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    expect(screen.getByRole('radiogroup', { name: 'Canale delle conversazioni' })).toBeVisible()
    expect(screen.queryByRole('radiogroup', { name: 'Tipo delle simulazioni' })).toBeNull()

    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByRole('radiogroup', { name: 'Tipo delle simulazioni' })).toBeVisible()
    expect(screen.queryByRole('radiogroup', { name: 'Canale delle conversazioni' })).toBeNull()
  })

  it('il canale restringe le conversazioni', async () => {
    const chiamata = { ...conversation, id: 'c2', title: 'Preventivo', mode: 'voice' as const }
    show(report({ conversations: [conversation, chiamata] }))

    await userEvent.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(screen.getByText('Preventivo')).toBeInTheDocument()
    expect(screen.queryByText('Reclamo sul rimborso')).not.toBeInTheDocument()
  })

  /* Il conteggio deve dire cosa si sta guardando: un "2" accanto a una riga
   * sola si legge come un errore. */
  it('con un filtro attivo la linguetta dice quante ne restano sul totale', async () => {
    const chiamata = { ...conversation, id: 'c2', title: 'Preventivo', mode: 'voice' as const }
    show(report({ conversations: [conversation, chiamata] }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (2)' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (1 di 2)' })).toBeInTheDocument()
  })

  it('il conteggio filtrato resta scritto anche sulla linguetta che non si guarda', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Cerca fra le conversazioni' }),
      'preventivo',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByRole('radio', { name: 'Conversazioni (0 di 1)' })).toBeInTheDocument()
  })

  it('la ricerca guarda il titolo, e dice quando è lei a non lasciare niente', async () => {
    show(report({ conversations: [conversation] }))

    const box = screen.getByRole('textbox', { name: 'Cerca fra le conversazioni' })

    await userEvent.type(box, 'rimb')
    expect(screen.getByText('Reclamo sul rimborso')).toBeInTheDocument()

    await userEvent.clear(box)
    await userEvent.type(box, 'preventivo')
    expect(screen.getByText('Nessuna conversazione con questi filtri')).toBeInTheDocument()
  })

  it('ogni prova tiene la propria ricerca, senza svuotare l altra', async () => {
    show(report({ conversations: [conversation], simulation_attempts: [attempt] }))

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Cerca fra le conversazioni' }),
      'reclamo',
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Simulazioni (1)' }))

    expect(screen.getByText('Procedure di sportello')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Cerca fra le simulazioni' })).toHaveValue('')
  })

  it('anche la simulazione si apre e si cancella', async () => {
    const handlers = show(report({ simulation_attempts: [attempt] }))

    await userEvent.click(screen.getByText('Procedure di sportello'))
    expect(handlers.onOpenAttempt).toHaveBeenCalledWith(attempt.id)

    await userEvent.click(screen.getByRole('button', { name: 'Elimina tentativo' }))
    expect(handlers.onDeleteAttempt).toHaveBeenCalledWith(attempt)
    expect(handlers.onOpenAttempt).toHaveBeenCalledTimes(1)
  })
})
