import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stato = vi.hoisted(() => ({
  users: [] as unknown[],
  assignments: [] as unknown[],
  isLoadingUsers: false,
  isLoadingAssignments: false,
}))
const invalidate = vi.hoisted(() => vi.fn())
const assign = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const withdraw = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useTraining', () => ({
  useAssignableUsers: () => ({ data: stato.users, isPending: stato.isLoadingUsers }),
  useAssignments: () => ({ data: stato.assignments, isPending: stato.isLoadingAssignments }),
  useAssignPath: () => assign,
  useDeleteAssignment: () => withdraw,
  useInvalidateTraining: () => invalidate,
}))

import type { AuthUser } from '../../src/services/auth'
import type { PathAssignment, TrainingPath } from '../../src/services/training'
import AssignPathModal from '../../src/components/AssignPathModal'

/* La finestra dice chi percorre il percorso, quindi deve saperlo dire anche
 * al contrario: togliere la spunta a chi ce l'ha già lo ritira. Prima quella
 * casella era spenta e il ritiro viveva solo nella tabella degli assegnati.
 *
 * Il ritiro però non parte dalla casella: quello che si prova qui è che fra
 * la spunta tolta e la richiesta al server ci sia la conferma, e che la
 * conferma dica a che punto era la persona. */

const utente = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u-1',
  cognito_sub: 'sub-1',
  email: 'anna@test.it',
  nome: 'Anna',
  cognome: 'Rossi',
  role_id: 'r-1',
  ruolo: 'user',
  status: 'active',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  last_login_at: null,
  last_activity_at: null,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
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
  steps: [],
  completed_steps: 0,
  current_position: 1,
  ...over,
})

const percorso: TrainingPath = {
  id: 'p-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Onboarding',
  description: null,
  steps: [],
  assigned_count: 1,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
}

const casella = (nome: string) => screen.getByRole('checkbox', { name: new RegExp(nome) })

describe('AssignPathModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assign.isPending = false
    assign.error = null
    withdraw.isPending = false
    withdraw.error = null
    stato.users = [utente(), utente({ id: 'u-2', nome: 'Luca', cognome: 'Verdi', email: 'l@t.it' })]
    stato.assignments = [assegnazione()]
    stato.isLoadingUsers = false
    stato.isLoadingAssignments = false
  })

  /* Le due letture sono due richieste: l'elenco delle persone e chi il
   * percorso ce l'ha già. Mostrando la prima da sola, chi ce l'ha appariva
   * non spuntato come chiunque altro, e in quella finestra "Seleziona tutti"
   * lo rimetteva in fila mentre una spunta tolta si registrava come una
   * spunta messa. */
  it('aspetta di sapere chi ce l’ha già prima di mostrare le persone', () => {
    stato.isLoadingAssignments = true
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)

    expect(screen.getByText('Caricamento delle persone...')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seleziona tutti' })).not.toBeInTheDocument()
  })

  it('mostra spuntato chi il percorso ce l’ha già', () => {
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)
    expect(casella('Anna Rossi')).toBeChecked()
    expect(casella('Anna Rossi')).toBeEnabled()
    expect(screen.getByText('già assegnato')).toBeInTheDocument()
    expect(casella('Luca Verdi')).not.toBeChecked()
  })

  it('togliere la spunta prepara il ritiro senza farlo partire', async () => {
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)
    await userEvent.click(casella('Anna Rossi'))

    expect(casella('Anna Rossi')).not.toBeChecked()
    expect(screen.getByText('da ritirare')).toBeInTheDocument()
    expect(withdraw.mutateAsync).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Ritira a 1 persona/ })).toBeEnabled()
  })

  it('chiede conferma e dice a che punto era chi si ritira', async () => {
    stato.assignments = [
      assegnazione({
        completed_steps: 3,
        steps: [1, 2, 3, 4, 5].map(() => ({})) as PathAssignment['steps'],
      }),
    ]
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)
    await userEvent.click(casella('Anna Rossi'))
    await userEvent.click(screen.getByRole('button', { name: /Ritira a 1 persona/ }))

    expect(screen.getByText('Ritirare il percorso?')).toBeInTheDocument()
    expect(screen.getByText('3 tappe superate su 5')).toBeInTheDocument()
    expect(withdraw.mutateAsync).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso' }))
    await waitFor(() => expect(withdraw.mutateAsync).toHaveBeenCalledWith('as-1'))
  })

  it('affida e ritira nella stessa passata', async () => {
    const onClose = vi.fn()
    render(<AssignPathModal path={percorso} onClose={onClose} />)
    await userEvent.click(casella('Anna Rossi'))
    await userEvent.click(casella('Luca Verdi'))
    await userEvent.click(screen.getByRole('button', { name: /Assegna a 1 persona e ritira a 1/ }))
    // La conferma dice anche chi lo riceve, perché la stessa passata fa le due cose
    expect(screen.getByText(/il percorso viene affidato a 1 persona/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso' }))

    await waitFor(() =>
      expect(assign.mutateAsync).toHaveBeenCalledWith({ path_id: 'p-1', user_ids: ['u-2'] }),
    )
    expect(withdraw.mutateAsync).toHaveBeenCalledWith('as-1')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('senza ritiri assegna e basta, senza passare dalla conferma', async () => {
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)
    await userEvent.click(casella('Luca Verdi'))
    await userEvent.click(screen.getByRole('button', { name: /Assegna a 1 persona/ }))

    await waitFor(() =>
      expect(assign.mutateAsync).toHaveBeenCalledWith({ path_id: 'p-1', user_ids: ['u-2'] }),
    )
    expect(screen.queryByText('Ritirare il percorso?')).not.toBeInTheDocument()
  })

  /* Una passata scrive più volte: una richiesta per le assegnazioni e una per
   * ogni ritiro. Con l'invalidazione attaccata a ognuna, i percorsi e le
   * assegnazioni si rileggevano tante volte quante le richieste, mentre la
   * passata era ancora in corso. */
  it('rilegge una volta sola in fondo alla passata', async () => {
    stato.users = [utente(), utente({ id: 'u-2', nome: 'Luca', cognome: 'Verdi', email: 'l@t.it' })]
    stato.assignments = [
      assegnazione(),
      assegnazione({ id: 'as-2', user_id: 'u-2', user_name: 'Luca Verdi', user_email: 'l@t.it' }),
    ]
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)

    await userEvent.click(casella('Anna Rossi'))
    await userEvent.click(casella('Luca Verdi'))
    await userEvent.click(screen.getByRole('button', { name: /Ritira a 2 persone/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Ritira a 2' }))

    await waitFor(() => expect(withdraw.mutateAsync).toHaveBeenCalledTimes(2))
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  /* Anche quando si rompe a metà: quello che era già stato scritto prima
   * dell'errore è nel database, e la pagina dietro deve raccontarlo. */
  it('rilegge anche se la passata si ferma a metà', async () => {
    withdraw.mutateAsync.mockRejectedValue(new Error('Ritiro non riuscito.'))
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)

    await userEvent.click(casella('Anna Rossi'))
    await userEvent.click(screen.getByRole('button', { name: /Ritira a 1 persona/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso' }))

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('il bottone di massa non ritira nessuno', async () => {
    /* "Deseleziona tutti" premuto per abitudine toglierebbe il percorso a
     * un'organizzazione intera: annulla solo la scelta appena fatta. */
    render(<AssignPathModal path={percorso} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seleziona tutti' }))
    await userEvent.click(screen.getByRole('button', { name: 'Deseleziona tutti' }))

    expect(casella('Anna Rossi')).toBeChecked()
    expect(casella('Luca Verdi')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Scegli chi deve percorrerlo' })).toBeDisabled()
  })
})
