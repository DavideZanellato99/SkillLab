import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ConversationDetailModal from '../../src/components/ConversationDetailModal'
import { formatTime } from '../../src/components/dateFormat'

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
    expect(screen.getByText('Aggiungi Revisione')).toBeInTheDocument()
    expect(calledPaths().some((p) => p.includes('/api/admin/conversations/'))).toBe(true)
  })

  /* Gli orari della trascrizione passavano da due funzioni scritte qui
   * dentro, che leggevano il momento con `new Date`: le colonne dello schema
   * sono in UTC senza fuso scritto, quindi l'ora di ogni messaggio scorreva
   * del fuso di chi guardava, mentre la riga del report da cui questa
   * schermata si apre mostrava quella giusta. */
  it("scrive l'ora dei messaggi come la scrive il resto dell'applicazione", async () => {
    show('admin')

    await screen.findByText('Verifico subito la pratica.')
    // Le due letture della stessa data non dipendono dal fuso della macchina
    expect(screen.getAllByText(formatTime('2026-03-05T09:05:00Z')).length).toBeGreaterThan(0)
    expect(formatTime('2026-03-05T09:05:00')).toBe(formatTime('2026-03-05T09:05:00Z'))
  })

  it('a chi rilegge una conversazione sua non offre la revisione', async () => {
    show('own')

    expect(await screen.findByText('Verifico subito la pratica.')).toBeInTheDocument()
    expect(screen.getByText('Sintesi del referto.')).toBeInTheDocument()
    // Né il pannello né il pulsante che lo apre: il voto lo corregge chi
    // insegna, non chi lo ha preso.
    expect(screen.queryByText('Modifica revisione')).not.toBeInTheDocument()
    expect(screen.queryByText('Aggiungi Revisione')).not.toBeInTheDocument()
    // La nota del docente invece si legge, come nel referto.
    expect(screen.getByText('Presentazione da rifare.')).toBeInTheDocument()
  })

  /* Il cestino è l'altra cosa che separa i due lettori, e sbagliata si
   * scopre quando qualcuno si è cancellato lo storico: a chi rilegge una
   * conversazione sua non deve comparire nemmeno se la schermata riceve per
   * sbaglio la funzione che elimina. */
  it('offre il cestino a un admin, e solo se chi lo ha aperto sa cosa farne', async () => {
    const { unmount } = show('admin', () => {})
    expect(await screen.findByText('Elimina Conversazione')).toBeInTheDocument()
    unmount()

    // Senza `onDeleted` la schermata non saprebbe chiudersi su una
    // conversazione che non esiste più: il cestino resta spento.
    show('admin')
    await screen.findByText('Verifico subito la pratica.')
    expect(screen.queryByText('Elimina Conversazione')).not.toBeInTheDocument()
  })

  it('a chi rilegge una conversazione sua non offre il cestino', async () => {
    show('own', () => {})

    await screen.findByText('Verifico subito la pratica.')
    expect(screen.queryByText('Elimina Conversazione')).not.toBeInTheDocument()
  })

  /* Un caricamento caduto è l'unica cosa a cui si può rimediare restando
   * dov'è: dentro una modale l'alternativa era chiudere la schermata e
   * riaprirla, cioè perdere il punto in cui si stava leggendo.
   *
   * Premuto il bottone il riquadro rosso sparisce e torna il caricamento:
   * TanStack Query riporta la lettura in attesa e si porta via l'errore, ed è
   * per questo che qui non c'è nessun "sto riprovando" da cercare. */
  it('offre di riprovare, e riprovando ricarica la conversazione', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Rete assente'))
    show('admin')

    // La seconda lettura resta appesa, per guardare cosa c'è a schermo mentre
    // il tentativo è in corso
    let rispondi = () => {}
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          rispondi = () =>
            resolve(json({ conversation_id: 'conv-1', messages, evaluation, review }))
        }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Riprova' }))

    expect(await screen.findByText('Caricamento conversazione...')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument()

    rispondi()
    expect(await screen.findByText('Verifico subito la pratica.')).toBeInTheDocument()
  })

  /* Chi rilegge una conversazione sua la legge in due chiamate invece che in
   * una, e il comando è lo stesso: le rilancia entrambe. */
  it('riprova anche quando le letture sono due', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Rete assente'))
    show('own')

    await userEvent.click(await screen.findByRole('button', { name: 'Riprova' }))

    expect(await screen.findByText('Verifico subito la pratica.')).toBeInTheDocument()
  })

  it('per una conversazione propria non passa dagli endpoint di amministrazione', async () => {
    show('own')

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await screen.findByText('Verifico subito la pratica.')
    expect(calledPaths().some((p) => p.includes('/api/admin/'))).toBe(false)
    expect(calledPaths().some((p) => p.includes('/api/chat/conversation/'))).toBe(true)
  })
})
