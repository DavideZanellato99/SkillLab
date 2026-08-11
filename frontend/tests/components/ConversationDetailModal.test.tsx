import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ConversationDetailModal from '../../src/components/ConversationDetailModal'

/* La stessa schermata per due lettori: un docente che corregge e chi rilegge
 * una conversazione sua.
 *
 * Quello che questi test guardano è il confine, cioè le due cose che
 * cambiano fra i due: da dove arrivano i dati (un endpoint solo per l'admin,
 * le due letture dello studente) e chi può scrivere una revisione. Che il
 * referto e la trascrizione si vedano è la parte facile; che uno studente
 * non si trovi davanti il pannello con cui si corregge il proprio voto è la
 * parte che, sbagliata, si scopre in produzione. */

const messages = [
  {
    id: 'm1',
    role: 'user',
    content: 'Buongiorno, la carta è bloccata.',
    created_at: '2026-03-05T09:05:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Verifico subito la pratica.',
    created_at: '2026-03-05T09:06:00Z',
  },
]

const evaluation = {
  id: 'ev-1',
  conversation_id: 'conv-1',
  overall_score: 6.5,
  final_score: 6.5,
  summary: 'Sintesi del referto.',
  criteria: [],
  previous: null,
  review: null,
  created_at: '2026-03-05T10:00:00Z',
  updated_at: '2026-03-05T10:00:00Z',
}

const review = {
  summary_note: null,
  override_score: null,
  override_reason: null,
  reviewer_name: 'Docente',
  final_score: 6.5,
  updated_at: '2026-03-05T11:00:00Z',
  annotations: [
    {
      message_id: 'm1',
      note: 'Presentazione da rifare.',
      reviewer_name: 'Docente',
      updated_at: '2026-03-05T11:00:00Z',
    },
  ],
}

const row = {
  conversation_id: 'conv-1',
  mode: 'text' as const,
  user_nome: 'Mario',
  user_cognome: 'Rossi',
  user_email: 'mario@test.invalid',
  avatar_name: 'Anna',
  conversation_at: '2026-03-05T09:00:00Z',
}

const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    const path = String(url)
    // L'endpoint dell'admin porta le tre cose insieme
    if (path.includes('/api/admin/conversations/'))
      return json({ conversation_id: 'conv-1', messages, evaluation, review })
    // Lo studente le legge in due volte
    if (path.includes('/evaluation')) return json(evaluation)
    if (path.includes('/api/chat/conversation/'))
      return json({
        id: 'conv-1',
        avatar_id: 'av-1',
        title: 'Clienti 1',
        mode: 'text',
        ended_at: '2026-03-05T09:30:00Z',
        created_at: '2026-03-05T09:00:00Z',
        updated_at: '2026-03-05T09:30:00Z',
        messages,
        review,
      })
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function show(scope: 'admin' | 'own', onDeleted?: () => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ConversationDetailModal row={row} scope={scope} onClose={() => {}} onDeleted={onDeleted} />
    </QueryClientProvider>,
  )
}

/** Gli indirizzi chiamati, per sapere da dove sono arrivati i dati. */
function calledPaths() {
  return fetchMock.mock.calls.map(([url]) => String(url))
}

describe('ConversationDetailModal', () => {
  it('mostra trascrizione e valutazione a un admin, con i comandi della revisione', async () => {
    show('admin')

    expect(await screen.findByText('Verifico subito la pratica.')).toBeInTheDocument()
    expect(screen.getByText('Sintesi del referto.')).toBeInTheDocument()
    // Una revisione con le sole note sui messaggi è ancora da scrivere, e il
    // comando lo dice: "Modifica" comparirebbe con una sintesi o una
    // correzione del voto.
    expect(screen.getByText('+ Aggiungi revisione')).toBeInTheDocument()
    expect(calledPaths().some((p) => p.includes('/api/admin/conversations/'))).toBe(true)
  })

  it('a chi rilegge una conversazione sua non offre la revisione', async () => {
    show('own')

    expect(await screen.findByText('Verifico subito la pratica.')).toBeInTheDocument()
    expect(screen.getByText('Sintesi del referto.')).toBeInTheDocument()
    // Né il pannello né il pulsante che lo apre: il voto lo corregge chi
    // insegna, non chi lo ha preso.
    expect(screen.queryByText('Modifica revisione')).not.toBeInTheDocument()
    expect(screen.queryByText('+ Aggiungi revisione')).not.toBeInTheDocument()
    // La nota del docente invece si legge, come nel referto.
    expect(screen.getByText('Presentazione da rifare.')).toBeInTheDocument()
  })

  /* Il cestino è l'altra cosa che separa i due lettori, e sbagliata si
   * scopre quando qualcuno si è cancellato lo storico: a chi rilegge una
   * conversazione sua non deve comparire nemmeno se la schermata riceve per
   * sbaglio la funzione che elimina. */
  it('offre il cestino a un admin, e solo se chi lo ha aperto sa cosa farne', async () => {
    const { unmount } = show('admin', () => {})
    expect(await screen.findByText('Elimina conversazione')).toBeInTheDocument()
    unmount()

    // Senza `onDeleted` la schermata non saprebbe chiudersi su una
    // conversazione che non esiste più: il cestino resta spento.
    show('admin')
    await screen.findByText('Verifico subito la pratica.')
    expect(screen.queryByText('Elimina conversazione')).not.toBeInTheDocument()
  })

  it('a chi rilegge una conversazione sua non offre il cestino', async () => {
    show('own', () => {})

    await screen.findByText('Verifico subito la pratica.')
    expect(screen.queryByText('Elimina conversazione')).not.toBeInTheDocument()
  })

  it('per una conversazione propria non passa dagli endpoint di amministrazione', async () => {
    show('own')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await screen.findByText('Verifico subito la pratica.')
    expect(calledPaths().some((p) => p.includes('/api/admin/'))).toBe(false)
    expect(calledPaths().some((p) => p.includes('/api/chat/conversation/'))).toBe(true)
  })
})
