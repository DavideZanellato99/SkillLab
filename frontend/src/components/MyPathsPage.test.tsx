import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useMyAssignments = vi.hoisted(() => vi.fn())
vi.mock('../hooks/useTraining', () => ({ useMyAssignments }))

import type { PathAssignment, StepProgress } from '../services/training'
import MyPathsPage from './MyPathsPage'

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

function renderPage(stato: Record<string, unknown>) {
  useMyAssignments.mockReturnValue({ isPending: false, error: null, ...stato })
  render(
    <MemoryRouter>
      <MyPathsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useMyAssignments.mockReset()
})

describe('MyPathsPage', () => {
  it('mostra ogni percorso con il suo avanzamento', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('In corso')).toBeInTheDocument()
  })

  it('porta al sentiero del percorso', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/percorsi/as-1')
  })

  /* Chi apre questa pagina cerca cosa deve fare: i percorsi ancora aperti
   * vanno in cima, i chiusi restano sotto perché sono la strada percorsa. */
  it('mette in cima i percorsi ancora da chiudere', () => {
    renderPage({
      data: [
        percorso({ id: 'as-1', path_title: 'Finito', status: 'completed' }),
        percorso({ id: 'as-2', path_title: 'Da fare', status: 'overdue' }),
      ],
    })

    const titoli = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(titoli).toEqual(['Da fare', 'Finito'])
  })

  it('dice a che tappa si è arrivati', () => {
    renderPage({ data: [percorso()] })

    const riga = screen.getByText(/Ora tocca a/)
    expect(within(riga).getByText('Avatar 2')).toBeInTheDocument()
    expect(riga).toHaveTextContent('conversazione')
  })

  /* Su un percorso chiuso non c'è più niente a cui tocchi: resta l'ultima
   * tappa, cioè dove si è arrivati. */
  it("su un percorso chiuso indica l'ultima tappa", () => {
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

    expect(screen.getByText(/Ultima tappa/)).toBeInTheDocument()
    expect(screen.queryByText(/Ora tocca a/)).not.toBeInTheDocument()
  })

  /* Senza descrizione la riga non resta vuota: quante tappe ci sono è la
   * cosa che distingue due percorsi con un titolo generico. */
  it('senza descrizione racconta di quante tappe è fatto', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByText('2 tappe da superare in ordine')).toBeInTheDocument()
  })

  it('usa il singolare per un percorso di una tappa sola', () => {
    renderPage({
      data: [percorso({ steps: [step({ id: 's-1', position: 1, status: 'active' })] })],
    })

    expect(screen.getByText('1 tappa da superare in ordine')).toBeInTheDocument()
  })

  it('preferisce la descrizione scritta dal formatore', () => {
    renderPage({ data: [percorso({ path_description: 'Le basi del ruolo' })] })

    expect(screen.getByText('Le basi del ruolo')).toBeInTheDocument()
  })

  it('dice da chi arriva il percorso e da quando', () => {
    renderPage({ data: [percorso()] })

    expect(screen.getByText('Assegnato da Marco Bianchi il 01 mar 2026')).toBeInTheDocument()
  })

  /* Se quell'account non c'è più resta la data: il percorso è comunque
   * arrivato in un giorno preciso, e togliere tutto lo farebbe sembrare
   * comparso dal nulla. */
  it("senza chi l'ha assegnato resta la data", () => {
    renderPage({ data: [percorso({ assigned_by_name: null })] })

    expect(screen.getByText('Assegnato il 01 mar 2026')).toBeInTheDocument()
  })

  it('mostra il caricamento', () => {
    renderPage({ isPending: true })

    expect(screen.getByText('Caricamento percorsi...')).toBeInTheDocument()
  })

  it("dice quando non c'è nessun percorso", () => {
    renderPage({ data: [] })

    expect(screen.getByText('Nessun percorso assegnato')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    renderPage({ data: [], error: new Error('Sessione scaduta.') })

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    renderPage({ data: [], error: 'guasto' })

    expect(screen.getByText('Impossibile caricare i percorsi.')).toBeInTheDocument()
  })
})
