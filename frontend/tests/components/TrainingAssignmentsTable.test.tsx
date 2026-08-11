import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PathAssignment, StepProgress } from '../../src/services/training'
import TrainingAssignmentsTable from '../../src/components/TrainingAssignmentsTable'

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

const assegnazione = (over: Partial<PathAssignment> = {}): PathAssignment => ({
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

function renderTable(righe: PathAssignment[] = [assegnazione()], showOrganization = false) {
  const onWithdraw = vi.fn()
  render(
    <TrainingAssignmentsTable
      assignments={righe}
      showOrganization={showOrganization}
      onWithdraw={onWithdraw}
    />,
  )
  return onWithdraw
}

const ricerca = () => screen.getByPlaceholderText(/Cerca per utente/)

describe('la riga', () => {
  it('dice chi sta percorrendo cosa e a che punto è', () => {
    renderTable()

    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
    expect(screen.getByText('Onboarding')).toBeInTheDocument()
    expect(screen.getByText('2. Avatar 2')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('In corso')).toBeInTheDocument()
  })

  it('scrive la scadenza della tappa aperta', () => {
    renderTable([
      assegnazione({
        steps: [step({ id: 's-1', position: 1, due_at: '2026-04-10T18:00:00' })],
        current_position: 1,
      }),
    ])

    expect(screen.getByText(/entro il 10 apr/)).toBeInTheDocument()
  })

  /* A percorso finito non c'è nessuna tappa corrente: si dice che sono tutte
   * superate invece di lasciare la colonna vuota, che sembrerebbe un dato
   * mancante. */
  it('dice "tutte superate" su un percorso chiuso', () => {
    renderTable([assegnazione({ status: 'completed', current_position: null, completed_steps: 2 })])

    expect(screen.getByText('tutte superate')).toBeInTheDocument()
  })

  /* L'organizzazione si scrive solo a chi ne vede più di una: a un org
   * admin sarebbe la stessa parola su ogni riga. */
  it("scrive l'organizzazione solo a chi ne vede più di una", () => {
    const { unmount } = render(
      <TrainingAssignmentsTable
        assignments={[assegnazione()]}
        showOrganization
        onWithdraw={vi.fn()}
      />,
    )
    expect(screen.getByText(/Banca Esempio · anna@test.it/)).toBeInTheDocument()
    unmount()

    renderTable()
    expect(screen.getByText('anna@test.it')).toBeInTheDocument()
  })
})

/* Le tappe per intero stanno sotto e si aprono su una riga alla volta: la
 * fila di sei tappe per venti persone sarebbe una tabella che non si legge. */
describe('le tappe di una riga', () => {
  it('sono chiuse finché non si apre la riga', () => {
    renderTable()

    expect(screen.queryByText('Avatar 1')).not.toBeInTheDocument()
  })

  it('si aprono cliccando la riga', async () => {
    renderTable()

    await userEvent.click(screen.getByText('Anna Rossi'))

    expect(screen.getByText('Avatar 1')).toBeInTheDocument()
  })

  it('si aprono e si richiudono con la freccia', async () => {
    renderTable()

    await userEvent.click(screen.getByRole('button', { name: 'Mostra le tappe di Anna Rossi' }))
    expect(screen.getByText('Avatar 1')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Nascondi le tappe di Anna Rossi' }))
    expect(screen.queryByText('Avatar 1')).not.toBeInTheDocument()
  })

  /* Una riga alla volta: aprire la seconda chiude la prima, o la tabella si
   * allungherebbe fino a perdere di vista quello che si stava confrontando. */
  it('ne tiene aperta una sola', async () => {
    renderTable([
      assegnazione(),
      assegnazione({ id: 'as-2', user_name: 'Marco Bianchi', user_email: 'marco@test.it' }),
    ])

    await userEvent.click(screen.getByText('Anna Rossi'))
    await userEvent.click(screen.getByText('Marco Bianchi'))

    expect(screen.getAllByText('Avatar 1')).toHaveLength(1)
  })
})

describe('ricerca', () => {
  it('filtra per nome e per email', async () => {
    renderTable([
      assegnazione(),
      assegnazione({ id: 'as-2', user_name: 'Marco Bianchi', user_email: 'marco@test.it' }),
    ])

    await userEvent.type(ricerca(), 'marco')

    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  /* La ricerca guarda anche la parola dello stato e il nome della tappa
   * aperta, che sono quelle che si leggono sulla riga: chi cerca "scaduto"
   * si aspetta di trovare chi è in ritardo. */
  it('trova per stato', async () => {
    renderTable([
      assegnazione(),
      assegnazione({ id: 'as-2', user_name: 'Marco Bianchi', status: 'overdue' }),
    ])

    await userEvent.type(ricerca(), 'scadut')

    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  it('trova per nome della tappa corrente', async () => {
    renderTable([
      assegnazione(),
      assegnazione({
        id: 'as-2',
        user_name: 'Marco Bianchi',
        steps: [step({ id: 's-9', position: 1, avatar_name: 'Cliente difficile' })],
        current_position: 1,
      }),
    ])

    await userEvent.type(ricerca(), 'difficile')

    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  it('distingue una ricerca senza esiti da una tabella vuota', async () => {
    renderTable()

    await userEvent.type(ricerca(), 'nessuno')
    expect(screen.getByText('Nessun percorso corrisponde alla ricerca')).toBeInTheDocument()
  })

  it('spiega una tabella vuota', () => {
    renderTable([])

    expect(
      screen.getByText('Nessun percorso ancora assegnato per la selezione corrente'),
    ).toBeInTheDocument()
  })
})

describe('ritiro', () => {
  it('chiede di ritirare il percorso di quella persona', async () => {
    const onWithdraw = renderTable()

    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso di Anna Rossi' }))

    expect(onWithdraw).toHaveBeenCalledWith(expect.objectContaining({ id: 'as-1' }))
  })

  /* Il ritiro sta dentro una riga che si apre al clic: senza fermare
   * l'evento, chiedere di ritirare aprirebbe anche le tappe sotto. */
  it('non apre anche le tappe della riga', async () => {
    renderTable()

    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso di Anna Rossi' }))

    expect(screen.queryByText('Avatar 1')).not.toBeInTheDocument()
  })

  it('nemmeno la freccia apre il ritiro', async () => {
    const onWithdraw = renderTable()

    await userEvent.click(screen.getByRole('button', { name: 'Mostra le tappe di Anna Rossi' }))

    expect(onWithdraw).not.toHaveBeenCalled()
    expect(within(screen.getByRole('table')).getByText('Avatar 1')).toBeInTheDocument()
  })
})
