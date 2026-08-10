import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useMyAssignments = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useTraining', () => ({ useMyAssignments }))

import type { PathAssignment, StepProgress } from '../services/training'
import PathMapPage from './PathMapPage'

const step = (
  over: Partial<StepProgress> & Pick<StepProgress, 'id' | 'position'>,
): StepProgress => ({
  kind: 'avatar',
  target_score: 7,
  due_at: null,
  avatar_id: `a${over.position}`,
  avatar_name: `Avatar ${over.position}`,
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
  status: 'locked',
  unlocked_at: null,
  attempts: 0,
  best_score: null,
  achieved_at: null,
  ...over,
})

const percorso = (over: Partial<PathAssignment> = {}): PathAssignment => ({
  id: 'as-1',
  path_id: 'p-1',
  path_title: 'Onboarding',
  path_description: null,
  user_id: 'u-1',
  user_name: 'Anna Rossi',
  user_email: 'anna@test.it',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  created_at: '2026-03-01T10:00:00Z',
  assigned_by_name: 'Marco Bianchi',
  status: 'active',
  steps: [
    step({ id: 's-1', position: 1, status: 'completed', unlocked_at: '2026-03-01T10:00:00Z' }),
    step({ id: 's-2', position: 2, status: 'active', unlocked_at: '2026-03-02T10:00:00Z' }),
  ],
  completed_steps: 1,
  current_position: 2,
  ...over,
})

function renderPage(stato: Record<string, unknown>, id = 'as-1') {
  useMyAssignments.mockReturnValue({ isPending: false, error: null, ...stato })
  render(
    <MemoryRouter initialEntries={[`/app/percorsi/${id}`]}>
      <Routes>
        <Route path="/app/percorsi" element={<p>Elenco dei percorsi</p>} />
        <Route path="/app/percorsi/:assignmentId" element={<PathMapPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const tappa = (posizione: number) =>
  screen.getByRole('button', { name: new RegExp(`^Tappa ${posizione},`) })

beforeEach(() => {
  useMyAssignments.mockReset()
})

describe('PathMapPage', () => {
  it('presenta il percorso con il suo avanzamento', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('In corso')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mappa del percorso' })).toBeInTheDocument()
  })

  it('senza descrizione dice quante tappe sono state superate', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByText(/1 di 2 tappe superate/)).toBeInTheDocument()
  })

  it('usa il singolare per un percorso di una tappa sola', () => {
    renderPage({
      data: [
        percorso({
          steps: [step({ id: 's-1', position: 1, status: 'active' })],
          completed_steps: 0,
        }),
      ],
    })

    expect(screen.getByText(/0 di 1 tappa superata/)).toBeInTheDocument()
  })

  /* La firma di chi ha assegnato il percorso c'è anche qui, perché a questa
   * pagina si arriva anche dalla notifica, senza passare dall'elenco. */
  it('dice da chi arriva il percorso', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByText('Assegnato da Marco Bianchi il 01 mar 2026')).toBeInTheDocument()
  })

  /* La pagina si apre sulla sola mappa: la domanda con cui la si apre è dove
   * si è arrivati, e a quella risponde il sentiero. Il dettaglio di una
   * tappa è una seconda domanda. */
  it('si apre senza nessuna tappa scelta', () => {
    renderPage({ data: [percorso()] })

    expect(screen.queryByLabelText('Dettaglio della tappa')).not.toBeInTheDocument()
  })

  it('apre il dettaglio della tappa scelta', async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))

    expect(screen.getByLabelText('Dettaglio della tappa')).toBeInTheDocument()
  })

  /* Il nodo è l'interruttore con cui il riquadro si è acceso: ricliccarlo lo
   * spegne, invece di costringere a cercare la chiusura. */
  it('richiude il dettaglio ricliccando la stessa tappa', async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))
    await userEvent.click(tappa(2))

    expect(screen.queryByLabelText('Dettaglio della tappa')).not.toBeInTheDocument()
  })

  it("passa da una tappa all'altra restando aperto", async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))
    await userEvent.click(tappa(1))

    expect(screen.getByLabelText('Dettaglio della tappa')).toBeInTheDocument()
  })

  it("torna all'elenco dei percorsi", async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(screen.getByRole('link', { name: /Tutti i percorsi/ }))

    expect(screen.getByText('Elenco dei percorsi')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    renderPage({ isPending: true })

    expect(screen.getByText('Caricamento del percorso...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    renderPage({ data: [], error: new Error('Sessione scaduta.') })

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    renderPage({ data: [], error: 'guasto' })

    expect(screen.getByText('Impossibile caricare il percorso.')).toBeInTheDocument()
  })

  /* Un percorso ritirato mentre la pagina era aperta, o un indirizzo
   * arrivato per posta: si dice cosa è successo e si lascia la via per
   * tornare indietro, invece di una pagina vuota. */
  it('spiega un percorso che non è più fra i propri', () => {
    renderPage({ data: [percorso()] }, 'as-999')

    expect(screen.getByText('Questo percorso non è più fra i tuoi')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tutti i percorsi/ })).toBeInTheDocument()
  })
})
