import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* Il runner su un test che registra lo schermo: l'ordine fra la richiesta
 * dello schermo e quella delle domande, cosa succede a un rifiuto, il
 * caricamento dopo la consegna, e la consegna immediata quando l'utente
 * ferma la condivisione dal browser. Il registratore è finto: cosa chiede al
 * browser lo prova il test del servizio. */

const sessione = { current: null as { id: string; ruolo: string } | null }
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const registratore = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  interrompi: null as (() => void) | null,
}))
vi.mock('../../src/services/screenRecording', async () => {
  const reale = await vi.importActual<typeof import('../../src/services/screenRecording')>(
    '../../src/services/screenRecording',
  )
  return {
    ...reale,
    startScreenRecording: (onInterrupted: () => void) => {
      registratore.interrompi = onInterrupted
      return registratore.start()
    },
  }
})

import { ScreenShareError } from '../../src/services/screenRecording'
import SimulationRunner from '../../src/components/SimulationRunner'

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
  records_screen: true,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  last_attempt_at: null,
  last_attempt_score: null,
  attempt_count: 0,
}

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
  screen_recording_expected: true,
  screen_recording: null,
  answers: [],
}

const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response

let fetchMock: ReturnType<typeof vi.fn>

const calls = (test: (url: string, init?: RequestInit) => boolean) =>
  fetchMock.mock.calls.filter(([url, init]) => test(String(url), init))

const startCalls = () => calls((url) => url.endsWith('/start'))
const submitCalls = () => calls((url, init) => url.endsWith('/attempts') && init?.method === 'POST')
const uploadCalls = () => calls((url) => url.includes('/screen-recording'))

function serve(sim = simulation, attempt = attemptResponse) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const path = String(url)
    if (path.endsWith('/start')) return json(questions)
    if (path.includes('/screen-recording')) {
      return json({
        attempt_id: 'att-1',
        mime_type: 'video/webm',
        duration_ms: 1000,
        size_bytes: 5,
        interrupted: false,
        created_at: '2026-01-02T10:00:00Z',
      })
    }
    if (init?.method === 'POST') return json(attempt)
    if (path.endsWith('/attempts')) return json([])
    // I percorsi assegnati, che la striscia sotto le regole chiede a un utente
    if (path.includes('/api/training/')) return json([])
    return json(sim)
  })
}

/* Un registratore che parte subito e, fermato, dà un video di cinque byte
   con il flag di interruzione che il finto gli ha visto passare. */
function recorderReady() {
  let interrupted = false
  const recording = () => ({
    blob: new Blob(['video'], { type: 'video/webm' }),
    mimeType: 'video/webm',
    durationMs: 1000,
    interrupted,
  })
  registratore.stop.mockImplementation(async () => recording())
  registratore.start.mockImplementation(async () => ({
    stop: registratore.stop,
    cancel: registratore.cancel,
  }))
  return {
    interrupt: () => {
      interrupted = true
      registratore.interrompi?.()
    },
  }
}

function renderRunner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/simulatore/sim-1']}>
        <Routes>
          <Route path="/app/simulatore/:simulationId" element={<SimulationRunner />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SimulationRunner con la registrazione dello schermo', () => {
  beforeEach(() => {
    sessione.current = { id: 'user-1', ruolo: 'user' }
    localStorage.clear()
    fetchMock = vi.fn()
    serve()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    registratore.start.mockReset()
    registratore.stop.mockReset()
    registratore.cancel.mockReset()
    registratore.interrompi = null
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('scrive fra le regole che lo schermo viene registrato', async () => {
    renderRunner()

    expect(
      await screen.findByText(/L'intero schermo viene registrato dall'avvio alla consegna/),
    ).toBeInTheDocument()
  })

  it("la prima volta avvisa, e dall'avviso si va dritti alla condivisione", async () => {
    const user = userEvent.setup()
    recorderReady()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))

    // L'avviso prima di tutto: niente schermo e niente domande finché non si legge
    expect(await screen.findByText('Questo test registra lo schermo')).toBeInTheDocument()
    expect(registratore.start).not.toHaveBeenCalled()
    expect(startCalls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Ho capito, condividi lo schermo' }))

    await screen.findByText('Prima domanda?')
    expect(registratore.start).toHaveBeenCalledTimes(1)
    expect(startCalls()).toHaveLength(1)
  })

  it('chiede lo schermo prima delle domande, e durante il test lo dice', async () => {
    const user = userEvent.setup()
    localStorage.setItem('skilllab.screen-recording-notice.user-1', 'letto')
    recorderReady()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))

    await screen.findByText('Prima domanda?')
    expect(registratore.start.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(startCalls()[0])],
    )
    expect(screen.getByText('Schermo in registrazione')).toBeInTheDocument()
  })

  it('senza condivisione il test non parte, e il motivo si legge', async () => {
    const user = userEvent.setup()
    localStorage.setItem('skilllab.screen-recording-notice.user-1', 'letto')
    registratore.start.mockRejectedValue(new ScreenShareError('refused'))
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))

    expect(await screen.findByText(/consenti la condivisione/)).toBeInTheDocument()
    expect(startCalls()).toHaveLength(0)
    expect(screen.queryByText('Prima domanda?')).toBeNull()
  })

  it('dopo la consegna carica il video sul tentativo appena nato', async () => {
    const user = userEvent.setup()
    localStorage.setItem('skilllab.screen-recording-notice.user-1', 'letto')
    recorderReady()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))
    await user.click(await screen.findByText('Alfa'))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(await screen.findByText('Delta'))
    await user.click(screen.getByRole('button', { name: 'Consegna il Test' }))

    await waitFor(() => expect(uploadCalls()).toHaveLength(1))
    const [url, init] = uploadCalls()[0]
    expect(String(url)).toContain('/api/simulations/attempts/att-1/screen-recording')
    expect(String(url)).toContain('interrupted=false')
    expect(init?.body).toBeInstanceOf(Blob)
    expect(await screen.findByText('Registrazione caricata insieme al tentativo.')).toBeVisible()
  })

  /* Il pulsante del browser a metà test: quello che c'è si consegna subito,
     il resto va in bianco, e il video sale segnato come interrotto. */
  it('se la condivisione si interrompe, consegna subito e lo segnala', async () => {
    const user = userEvent.setup()
    localStorage.setItem('skilllab.screen-recording-notice.user-1', 'letto')
    const recorder = recorderReady()
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))
    await user.click(await screen.findByText('Alfa'))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await screen.findByText('Seconda domanda?')

    recorder.interrupt()

    await waitFor(() => expect(submitCalls()).toHaveLength(1))
    const body = JSON.parse(submitCalls()[0][1]?.body as string)
    expect(body.answers.map((a: { selected_option: number | null }) => a.selected_option)).toEqual([
      0,
      null,
    ])
    await waitFor(() => expect(uploadCalls()).toHaveLength(1))
    expect(String(uploadCalls()[0][0])).toContain('interrupted=true')
    expect(
      await screen.findByText(/La condivisione dello schermo è stata interrotta/),
    ).toBeVisible()
  })

  it('il super admin non viene registrato', async () => {
    const user = userEvent.setup()
    sessione.current = { id: 'sa-1', ruolo: 'super_admin' }
    serve(simulation, { ...attemptResponse, screen_recording_expected: false })
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))

    await screen.findByText('Prima domanda?')
    expect(registratore.start).not.toHaveBeenCalled()
    expect(screen.queryByText('Schermo in registrazione')).toBeNull()
    expect(screen.queryByText(/L'intero schermo viene registrato/)).toBeNull()
  })

  it('un test senza spunta non chiede niente', async () => {
    const user = userEvent.setup()
    serve(
      { ...simulation, records_screen: false },
      { ...attemptResponse, screen_recording_expected: false },
    )
    renderRunner()

    await user.click(await screen.findByRole('button', { name: 'Inizia il Test' }))

    await screen.findByText('Prima domanda?')
    expect(registratore.start).not.toHaveBeenCalled()
  })
})
