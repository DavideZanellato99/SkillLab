import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useMyAssignments = vi.hoisted(() => vi.fn())
const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useTraining', () => ({ useMyAssignments }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

import type { AuthUser } from '../../src/services/auth'
import type { PathAssignment, StepProgress } from '../../src/services/training'
import PathStepNotice from '../../src/components/PathStepNotice'

/* La striscia dice, dentro la prova, che quella prova conta per un percorso.
 * Quello che i test tengono fermo è che lo dica per i dati e non per la
 * strada fatta per arrivarci: compare sulla tappa di adesso, comunque ci si
 * sia entrati, e su nient'altro. */

const step = (over: Partial<StepProgress> = {}): StepProgress => ({
  id: 's-2',
  position: 2,
  kind: 'avatar',
  target_score: 7.5,
  criteria_targets: [],
  due_at: null,
  avatar_id: 'a-1',
  avatar_name: 'Mario Rossi',
  avatar_category: 'Clienti',
  avatar_category_color: 'violet',
  simulation_id: null,
  simulation_title: null,
  simulation_kind: null,
  status: 'active',
  unlocked_at: '2026-03-02T10:00:00',
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
  created_at: '2026-03-01T10:00:00',
  assigned_by_name: 'Marco Bianchi',
  status: 'active',
  steps: [step({ id: 's-1', position: 1, status: 'completed', avatar_id: 'a-0' }), step()],
  completed_steps: 1,
  current_position: 2,
  ...over,
})

const utente = { id: 'u-1', email: 'anna@test.it', ruolo: 'user' } as AuthUser

type NoticeProps = { kind: 'avatar' | 'simulation'; targetId?: string }

const tree = (props: NoticeProps) => (
  <MemoryRouter>
    <PathStepNotice {...props} />
  </MemoryRouter>
)

/* Il rerender non rimonta: la striscia si ricorda la tappa che ha visto in
   corso, e quella memoria vale finché si resta su questa schermata. */
function renderNotice(
  assignments: PathAssignment[],
  props: NoticeProps,
  user: AuthUser | null = utente,
) {
  useAuth.mockReturnValue({ user })
  useMyAssignments.mockReturnValue({ data: assignments })
  const view = render(tree(props))
  return {
    rerender: (next: PathAssignment[], nextProps: NoticeProps = props) => {
      useMyAssignments.mockReturnValue({ data: next })
      view.rerender(tree(nextProps))
    },
  }
}

beforeEach(() => {
  useMyAssignments.mockReset()
  useAuth.mockReset()
})

describe('PathStepNotice', () => {
  it('dice quale tappa è, di quale percorso, e cosa serve per superarla', () => {
    renderNotice([percorso()], { kind: 'avatar', targetId: 'a-1' })

    expect(useMyAssignments).toHaveBeenCalledWith(true)
    expect(screen.getByText(/Tappa 2 di 2 di/)).toHaveTextContent('Onboarding')
    expect(screen.getByText(/Obiettivo/)).toHaveTextContent('7,5 su 10')
  })

  /* Il collegamento porta alla tappa già aperta sulla mappa: si torna al
     percorso per rileggere cosa serve, non per ritrovare il nodo. */
  it('riporta al percorso, sulla tappa di cui parla', () => {
    renderNotice([percorso()], { kind: 'avatar', targetId: 'a-1' })

    expect(screen.getByRole('link', { name: 'Vedi il percorso' })).toHaveAttribute(
      'href',
      '/app/percorsi/as-1?tappa=2',
    )
  })

  /* Quanto ci si è andati vicino è il meglio fatto sulla tappa: il voto della
     conversazione a schermo lo dice già la pastiglia nella testata, e la
     domanda qui è un'altra, se quel voto basta. */
  it('dice il meglio fatto finora sulla tappa', () => {
    renderNotice([percorso({ steps: [step({ best_score: 6.8, attempts: 2 })] })], {
      kind: 'avatar',
      targetId: 'a-1',
    })

    expect(screen.getByText('6,8')).toBeInTheDocument()
  })

  it('dice quando non si è ancora provato', () => {
    renderNotice([percorso()], { kind: 'avatar', targetId: 'a-1' })

    expect(screen.getByText('nessun tentativo')).toBeInTheDocument()
  })

  /* Superata la tappa la striscia resta e cambia parola: sparire proprio
     quando c'è una bella notizia da dare sarebbe il momento peggiore. */
  it('resta a dire che la tappa è superata quando il voto arriva', () => {
    const { rerender } = renderNotice([percorso()], { kind: 'avatar', targetId: 'a-1' })

    // La valutazione è arrivata: la tappa è chiusa e quella di adesso, per il
    // percorso, è un'altra
    rerender(
      [
        percorso({
          status: 'completed',
          completed_steps: 2,
          current_position: null,
          steps: [
            step({ id: 's-1', position: 1, status: 'completed', avatar_id: 'a-0' }),
            step({ status: 'completed', best_score: 8, achieved_at: '2026-03-03T10:00:00' }),
          ],
        }),
      ],
      { kind: 'avatar', targetId: 'a-1' },
    )

    expect(screen.getByText(/superata/)).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai al percorso' })).toBeInTheDocument()
  })

  /* Una tappa chiusa da tempo su un avatar aperto dalla galleria non è una
     notizia: la memoria vale per la schermata che si sta guardando. */
  it('non parla di una tappa chiusa che non ha visto in corso', () => {
    renderNotice(
      [
        percorso({
          status: 'completed',
          completed_steps: 2,
          current_position: null,
          steps: [
            step({ id: 's-1', position: 1, status: 'completed', avatar_id: 'a-0' }),
            step({ status: 'completed', best_score: 8 }),
          ],
        }),
      ],
      { kind: 'avatar', targetId: 'a-1' },
    )

    expect(document.body.querySelector('aside')).toBeNull()
  })

  it('conta le soglie sui criteri raggiunte invece di elencarle', () => {
    renderNotice(
      [
        percorso({
          steps: [
            step({
              criteria_targets: [
                { key: 'empatia', label: 'Empatia', target: 7 },
                { key: 'chiarezza', label: 'Chiarezza', target: 8 },
              ],
              best_criteria_scores: { empatia: 7.5, chiarezza: 6 },
            }),
          ],
          completed_steps: 0,
          current_position: 1,
        }),
      ],
      { kind: 'avatar', targetId: 'a-1' },
    )

    expect(screen.getByText(/criteri/)).toHaveTextContent('1 di 2')
  })

  it('mostra il termine della tappa', () => {
    const domani = new Date(Date.now() + 86_400_000)
    domani.setHours(18, 0, 0, 0)
    renderNotice(
      [percorso({ steps: [step({ due_at: domani.toISOString() })], completed_steps: 0 })],
      { kind: 'avatar', targetId: 'a-1' },
    )

    expect(screen.getByText('Scade domani alle 18:00')).toBeInTheDocument()
  })

  /* Su un avatar che nessun percorso sta aspettando non c'è niente da dire:
     è una conversazione come le altre. */
  it('tace su una prova che non è la tappa di nessuno', () => {
    renderNotice([percorso()], { kind: 'avatar', targetId: 'a-9' })

    expect(document.body.querySelector('aside')).toBeNull()
  })

  it('tace sulla prova di una tappa che non è ancora il proprio turno', () => {
    renderNotice(
      [
        percorso({
          steps: [
            step({ id: 's-1', position: 1, status: 'active', avatar_id: 'a-0' }),
            step({ status: 'locked', unlocked_at: null }),
          ],
          completed_steps: 0,
          current_position: 1,
        }),
      ],
      { kind: 'avatar', targetId: 'a-1' },
    )

    expect(document.body.querySelector('aside')).toBeNull()
  })

  /* A chi amministra la rotta dei propri percorsi risponde 403: la domanda
     non gliela facciamo nemmeno. */
  it('non chiede i percorsi a chi amministra', () => {
    renderNotice([], { kind: 'avatar', targetId: 'a-1' }, {
      ...utente,
      ruolo: 'organization_admin',
    } as AuthUser)

    expect(useMyAssignments).toHaveBeenCalledWith(false)
    expect(document.body.querySelector('aside')).toBeNull()
  })
})
