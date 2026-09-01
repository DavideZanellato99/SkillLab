import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useMyAssignments = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useTraining', () => ({ useMyAssignments }))

import type { PathAssignment, StepProgress } from '../../src/services/training'
import PathMapPage from '../../src/components/PathMapPage'

const step = (
  over: Partial<StepProgress> & Pick<StepProgress, 'id' | 'position'>,
): StepProgress => ({
  kind: 'avatar',
  target_score: 7,
  criteria_targets: [],
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
  best_criteria_scores: {},
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

/** Quale tappa è aperta si legge nell'indirizzo, quindi i test lo guardano. */
function Indirizzo() {
  return <p data-testid="indirizzo">{useLocation().search}</p>
}

function renderPage(stato: Record<string, unknown>, id = 'as-1') {
  useMyAssignments.mockReturnValue({ isPending: false, error: null, ...stato })
  render(
    <MemoryRouter initialEntries={[`/app/percorsi/${id}`]}>
      <Indirizzo />
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
    expect(screen.getByText('In Corso')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Mappa del Percorso' })).toBeInTheDocument()
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

    expect(screen.queryByLabelText('Dettaglio della Tappa')).not.toBeInTheDocument()
  })

  it('apre il dettaglio della tappa scelta', async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))

    expect(screen.getByLabelText('Dettaglio della Tappa')).toBeInTheDocument()
  })

  /* Il nodo è l'interruttore con cui il riquadro si è acceso: ricliccarlo lo
   * spegne, invece di costringere a cercare la chiusura. */
  it('richiude il dettaglio ricliccando la stessa tappa', async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))
    await userEvent.click(tappa(2))

    expect(screen.queryByLabelText('Dettaglio della Tappa')).not.toBeInTheDocument()
  })

  it("passa da una tappa all'altra restando aperto", async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))
    await userEvent.click(tappa(1))

    expect(screen.getByLabelText('Dettaglio della Tappa')).toBeInTheDocument()
  })

  /* La tappa aperta sta nell'indirizzo: ricaricando la pagina, o aprendo un
     collegamento che la nomina, il riquadro è già quello giusto. */
  it('apre la tappa scritta nell’indirizzo', () => {
    renderPage({ data: [percorso()] }, 'as-1?tappa=1')

    expect(screen.getByLabelText('Dettaglio della Tappa')).toBeInTheDocument()
    expect(screen.getByText('Tappa 1 di 2')).toBeInTheDocument()
  })

  it('scrive nell’indirizzo la tappa che si sceglie', async () => {
    renderPage({ data: [percorso()] })

    await userEvent.click(tappa(2))

    expect(screen.getByTestId('indirizzo')).toHaveTextContent('?tappa=2')
  })

  /* Una posizione che quel percorso non ha (un collegamento vecchio, una
     tappa tolta) non apre niente: la mappa resta quella. */
  it('ignora una tappa che non esiste', () => {
    renderPage({ data: [percorso()] }, 'as-1?tappa=9')

    expect(screen.queryByLabelText('Dettaglio della Tappa')).not.toBeInTheDocument()
  })

  /* Aprire la mappa e volerci entrare sono due gesti di seguito: il secondo
     non deve passare dal nodo e dal riquadro. */
  it('porta alla prova della tappa di adesso', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByRole('link', { name: /^Riprendi dalla tappa 2/ })).toHaveAttribute(
      'href',
      '/app/chat/a2',
    )
  })

  it('non invita a riprendere un percorso già chiuso', () => {
    renderPage({
      data: [
        percorso({
          status: 'completed',
          completed_steps: 2,
          current_position: null,
          steps: [
            step({ id: 's-1', position: 1, status: 'completed' }),
            step({ id: 's-2', position: 2, status: 'completed' }),
          ],
        }),
      ],
    })

    expect(screen.queryByRole('link', { name: /^Riprendi/ })).not.toBeInTheDocument()
  })

  it("torna all'elenco dei percorsi", async () => {
    renderPage({ data: [percorso(), percorso({ id: 'as-2', path_title: 'Altro' })] })

    await userEvent.click(screen.getByRole('link', { name: /Tutti i Percorsi/ }))

    expect(screen.getByText('Elenco dei percorsi')).toBeInTheDocument()
  })

  /* Con un percorso solo la sezione entra dritta qui: il ritorno all'elenco
   * rimbalzerebbe subito indietro, senza che si veda succedere niente. */
  it("con un percorso solo non offre il ritorno all'elenco", () => {
    renderPage({ data: [percorso()] })

    expect(screen.queryByRole('link', { name: /Tutti i Percorsi/ })).not.toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: /Tutti i Percorsi/ })).toBeInTheDocument()
  })
})
