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
  kind: 'multiple',
  source: 'ai',
  document_name: 'procedura.pdf',
  question_count: questions.length,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  last_attempt_at: null,
  last_attempt_score: null,
  attempt_count: 0,
}

/* Lo stesso test in versione a risposta aperta: le domande non hanno
 * alternative e si risponde scrivendo. Serve a provare che il corpo della
 * consegna cambia forma, che è l'altra metà di quello che questo file
 * verifica. */
const openSimulation = { ...simulation, kind: 'open' }
const openQuestions = questions.map((q) => ({ ...q, options: [] }))

/* Gli altri due tipi senza cronometro. Le domande arrivano già mescolate dal
 * server, quindi il mock le manda nell'ordine sbagliato apposta: rimetterle a
 * posto è quello che il test deve provare. */
const orderingSimulation = { ...simulation, kind: 'ordering' }
const orderingQuestions = [
  { id: 'q1', position: 1, text: 'Rimetti in ordine?', options: [], steps: ['Beta', 'Alfa'] },
  { id: 'q2', position: 2, text: 'E questi?', options: [], steps: ['Delta', 'Gamma'] },
]

const matchingSimulation = { ...simulation, kind: 'matching' }
const matchingQuestions = [
  {
    id: 'q1',
    position: 1,
    text: 'Abbina?',
    options: [],
    left: ['Carta'],
    right: ['Estero', 'Sportello'],
  },
  {
    id: 'q2',
    position: 2,
    text: 'E questi?',
    options: [],
    left: ['Mutuo'],
    right: ['Crediti', 'Estero'],
  },
]

const attemptResponse = {
  id: 'att-1',
  simulation_id: 'sim-1',
  simulation_title: simulation.title,
  simulation_kind: 'multiple',
  simulation_source: 'ai',
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

/** Quante volte è stato chiesto al server di estrarre le domande. */
function startCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/start')).length
}

/** Serve un test di un altro tipo al posto di quello di serie. */
function serve(sim: object, drawn: object[], kind: string) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/start')) return json(drawn)
    if (init?.method === 'POST') return json({ ...attemptResponse, simulation_kind: kind })
    if (String(url).endsWith('/attempts')) return json([])
    return json(sim)
  })
}

const serveOpenSimulation = () => serve(openSimulation, openQuestions, 'open')

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
      // Le domande arrivano dall'estrazione, non dalla simulazione: è il
      // server a decidere quali dieci, e qui sono sempre le stesse due
      if (String(url).endsWith('/start')) return json(questions)
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

  it('su un test a risposta aperta consegna il testo scritto e nessun tempo', async () => {
    const user = userEvent.setup()
    serveOpenSimulation()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))

    await user.type(await screen.findByRole('textbox'), 'Prima risposta scritta')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    await user.type(await screen.findByRole('textbox'), 'Seconda risposta scritta')
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const body = submittedBody()

    expect(body.answers.map((a: { answer_text: string }) => a.answer_text)).toEqual([
      'Prima risposta scritta',
      'Seconda risposta scritta',
    ])
    /* Nessun tempo: qui non c'è cronometro, e mandarne uno finto
       significherebbe far scendere i punti di chi si è riletto. */
    for (const answer of body.answers) {
      expect(answer.elapsed_ms).toBeUndefined()
      expect(answer.selected_option).toBeUndefined()
    }
  })

  it('una domanda aperta lasciata in bianco viaggia come non risposta', async () => {
    const user = userEvent.setup()
    serveOpenSimulation()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))
    await user.click(await screen.findByRole('button', { name: 'Salta la domanda' }))

    await user.type(await screen.findByRole('textbox'), 'Solo la seconda')
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const [saltata] = submittedBody().answers
    // Null e non stringa vuota: chi non ha risposto resta distinguibile
    expect(saltata.answer_text).toBeNull()
  })

  it('le domande si estraggono premendo inizia, non aprendo la pagina', async () => {
    const user = userEvent.setup()
    renderRunner()

    // La pagina è aperta sulle regole e nessuna domanda è stata ancora
    // decisa: se l'estrazione partisse qui, il test sarebbe già composto
    // per chi si limita a guardare
    const inizia = await screen.findByRole('button', { name: 'Inizia il test' })
    expect(startCalls()).toBe(0)

    await user.click(inizia)
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
    expect(startCalls()).toBe(1)
  })

  it('riprovare il test fa estrarre altre domande', async () => {
    const user = userEvent.setup()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))
    await user.click(await screen.findByText('Alfa'))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(await screen.findByText('Gamma'))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await user.click(await screen.findByRole('button', { name: 'Riprova il test' }))
    // Si torna alle regole, e il test nuovo comincia da un'altra estrazione
    await user.click(await screen.findByRole('button', { name: /il test$/ }))
    expect(await screen.findByText('Alfa')).toBeInTheDocument()
    expect(startCalls()).toBe(2)
  })

  it('il cronometro non compare sui test a risposta aperta', async () => {
    const user = userEvent.setup()
    serveOpenSimulation()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))

    expect(await screen.findByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
  })

  it('su un test di ordinamento consegna i passi nella sequenza scelta', async () => {
    const user = userEvent.setup()
    serve(orderingSimulation, orderingQuestions, 'ordering')
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))

    // I passi arrivano mescolati: rimetterli a posto è la risposta
    await user.click(await screen.findByRole('button', { name: 'Sposta in alto: Alfa' }))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    await user.click(await screen.findByRole('button', { name: 'Sposta in basso: Delta' }))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const body = submittedBody()

    expect(body.answers.map((a: { ordered_steps: string[] }) => a.ordered_steps)).toEqual([
      ['Alfa', 'Beta'],
      ['Gamma', 'Delta'],
    ])
    // Nessun cronometro qui, come sulle risposte aperte
    for (const answer of body.answers) {
      expect(answer.elapsed_ms).toBeUndefined()
    }
  })

  it('un ordinamento mai toccato viaggia come non risposto', async () => {
    const user = userEvent.setup()
    serve(orderingSimulation, orderingQuestions, 'ordering')
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))
    /* Consegnare la sequenza così com'era arrivata sarebbe una risposta, e
       chi non tocca niente non ne sta dando una: il pulsante lo dice, e il
       corpo della richiesta pure. */
    await user.click(await screen.findByRole('button', { name: 'Salta la domanda' }))
    await user.click(await screen.findByRole('button', { name: 'Sposta in alto: Gamma' }))
    await user.click(screen.getByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const [saltata] = submittedBody().answers
    expect(saltata.ordered_steps).toBeNull()
  })

  it('su un test di abbinamento consegna le coppie formate', async () => {
    const user = userEvent.setup()
    serve(matchingSimulation, matchingQuestions, 'matching')
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il test' }))

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Sportello' }))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    /* La seconda si lascia scoperta: vale sbagliata, e non viaggia. Sul
       passo finale il pulsante consegna, quindi non dice "salta" nemmeno
       quando non è stato scelto niente. */
    await user.click(await screen.findByRole('button', { name: 'Consegna il test' }))

    await waitFor(() => expect(submittedBody()).not.toBeNull())
    const body = submittedBody()

    expect(body.answers[0].pairs).toEqual([{ left: 'Carta', right: 'Sportello' }])
    expect(body.answers[1].pairs).toBeNull()
  })
})
