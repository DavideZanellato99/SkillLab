import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SimulationRunner from './SimulationRunner'

/* Il tratto che nessun altro test copre: dalla risposta data al corpo della
 * richiesta di consegna.
 *
 * Lo step sa misurare il tempo e il server sa cosa farne, ed entrambi hanno i
 * loro test; in mezzo c'è il pezzo che raccoglie le risposte e le impacchetta,
 * ed è lì che un `elapsed_ms` si perde senza che niente si rompa: il server
 * che non riceve il tempo non protesta, dà punto pieno. Un test che guarda il
 * corpo della POST è l'unico modo di accorgersene.
 *
 * Niente cronometro finto qui: le domande si consegnano subito e il tempo
 * misurato è di pochi millisecondi. Quanto valgano quei millisecondi lo
 * provano gli altri due, questo verifica solo che arrivino. */

const questions = [
  { id: 'q1', position: 1, text: 'Prima domanda?', options: ['Alfa', 'Beta'] },
  { id: 'q2', position: 2, text: 'Seconda domanda?', options: ['Gamma', 'Delta'] },
]

const simulation = {
  id: 'sim-1',
  organization_id: 'org-1',
  organization_name: 'Organizzazione',
  title: 'Procedure di sportello',
  description: 'Due domande di prova',
  status: 'published',
  document_name: 'procedura.pdf',
  question_count: questions.length,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  last_attempt_at: null,
  last_attempt_score: null,
  attempt_count: 0,
  questions,
}

const attemptResponse = {
  id: 'att-1',
  simulation_id: 'sim-1',
  simulation_title: simulation.title,
  user_id: 'user-1',
  user_email: 'tizio@example.com',
  user_name: 'Tizio',
  correct_count: 1,
  question_count: 2,
  earned_points: 0.8,
  score: 4,
  created_at: '2026-01-02T10:00:00Z',
  answers: [],
}

const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response

let fetchMock: ReturnType<typeof vi.fn>

/** Il corpo JSON della consegna, o null se non è mai partita. */
function submittedBody() {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url).endsWith('/attempts') && init?.method === 'POST',
  )
  return call ? JSON.parse(call[1].body as string) : null
}

function renderRunner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/simulatore/sim-1']}>
        <Routes>
          <Route path="/simulatore/:simulationId" element={<SimulationRunner />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SimulationRunner', () => {
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json(attemptResponse)
      if (String(url).endsWith('/attempts')) return json([])
      return json(simulation)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('consegna ogni risposta con il tempo che è costata', async () => {
    const user = userEvent.setup()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))

    await user.click(await screen.findByText('Alfa'))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    await user.click(await screen.findByText('Delta'))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const body = submittedBody()

    expect(body.answers).toHaveLength(2)
    expect(body.answers.map((a: { question_id: string }) => a.question_id)).toEqual(['q1', 'q2'])
    expect(body.answers.map((a: { selected_option: number }) => a.selected_option)).toEqual([0, 1])
    // Il punto della prova: il tempo c'è su ogni risposta, ed è un numero
    for (const answer of body.answers) {
      expect(typeof answer.elapsed_ms).toBe('number')
      expect(answer.elapsed_ms).toBeGreaterThanOrEqual(0)
    }
  })

  it('una domanda saltata viaggia in bianco, ma con il suo tempo', async () => {
    const user = userEvent.setup()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))
    await user.click(await screen.findByRole('button', { name: 'Salta la domanda' }))
    await user.click(await screen.findByText('Gamma'))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const [saltata] = submittedBody().answers
    expect(saltata.selected_option).toBeNull()
    expect(typeof saltata.elapsed_ms).toBe('number')
  })

  it('mostra il riepilogo solo alla fine, mai durante il test', async () => {
    const user = userEvent.setup()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))
    await user.click(await screen.findByText('Alfa'))
    expect(screen.queryByText(/risposte corrette/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(await screen.findByText('Gamma'))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    expect(await screen.findByText(/1 risposte corrette su 2/)).toBeInTheDocument()
  })
})
