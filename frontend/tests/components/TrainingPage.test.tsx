import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({ current: { ruolo: 'super_admin', organization_id: 'org-1' } }))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const stato = vi.hoisted(() => ({
  paths: { data: [] as unknown[], isPending: false, error: null as unknown },
  assignments: { data: [] as unknown[], isPending: false, error: null as unknown },
}))
const deletePath = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
const deleteAssignment = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useTraining', () => ({
  usePaths: () => stato.paths,
  useAssignments: () => stato.assignments,
  useDeletePath: () => deletePath,
  useDeleteAssignment: () => deleteAssignment,
}))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

/* Le due modali hanno i loro moduli e i loro test: qui sostituirle tiene il
 * banco a quello che la pagina decide, cioè quando si aprono. */
vi.mock('../../src/components/TrainingPathEditorModal', () => ({
  default: ({ path }: { path: { title?: string } | null }) => (
    <div>editor: {path?.title ?? 'nuovo percorso'}</div>
  ),
}))
vi.mock('../../src/components/AssignPathModal', () => ({
  default: ({ path }: { path: { title: string } }) => <div>assegna: {path.title}</div>,
}))

import type { PathAssignment, TrainingPath } from '../../src/services/training'
import TrainingPage from '../../src/components/TrainingPage'

const percorso = (over: Partial<TrainingPath> = {}): TrainingPath => ({
  id: 'p-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Onboarding',
  description: null,
  steps: [],
  assigned_count: 0,
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
  current_position: null,
  ...over,
})

function renderPage(ruolo = 'super_admin') {
  sessione.current = { ruolo, organization_id: 'org-1' }
  render(<TrainingPage />)
}

const linguetta = (nome: RegExp) => screen.getByRole('tab', { name: nome })

beforeEach(() => {
  stato.paths = { data: [percorso()], isPending: false, error: null }
  stato.assignments = { data: [assegnazione()], isPending: false, error: null }
  deletePath.mutateAsync.mockReset()
  deletePath.mutateAsync.mockResolvedValue({ success: true })
  deletePath.isPending = false
  deletePath.error = null
  deleteAssignment.mutateAsync.mockReset()
  deleteAssignment.mutateAsync.mockResolvedValue({ success: true })
  deleteAssignment.isPending = false
  deleteAssignment.error = null
})

/* Due linguette perché sono due domande diverse: di cosa sono fatti i
 * percorsi, e a che punto è la propria gente. */
describe('le due linguette', () => {
  it("contano quello che c'è sotto ciascuna", () => {
    renderPage()

    expect(linguetta(/Percorsi \(1\)/)).toBeInTheDocument()
    expect(linguetta(/Assegnati \(1\)/)).toBeInTheDocument()
  })

  it('si apre sui percorsi', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('passa alle assegnazioni', async () => {
    renderPage()

    await userEvent.click(linguetta(/Assegnati/))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
  })
})

/* Il filtro per organizzazione ha senso solo per il super admin, che è
 * l'unico a vederne più di una: a un org admin sarebbe una tendina con
 * dentro la sua sola organizzazione. */
describe('filtro per organizzazione', () => {
  it("c'è per il super admin", () => {
    renderPage()

    expect(screen.getByText('Tutte le Organizzazioni')).toBeInTheDocument()
  })

  it("non c'è per un org admin", () => {
    renderPage('organization_admin')

    expect(screen.queryByText('Tutte le Organizzazioni')).not.toBeInTheDocument()
  })
})

describe('composizione e assegnazione', () => {
  it("apre l'editor su un percorso nuovo", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: /Nuovo Percorso/ }))

    expect(screen.getByText('editor: nuovo percorso')).toBeInTheDocument()
  })

  it("apre l'editor sul percorso da modificare", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Modifica Onboarding' }))

    expect(screen.getByText('editor: Onboarding')).toBeInTheDocument()
  })

  it("apre l'assegnazione sul percorso scelto", async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Assegna Onboarding' }))

    expect(screen.getByText('assegna: Onboarding')).toBeInTheDocument()
  })
})

describe('eliminazione di un percorso', () => {
  /* La conferma dice cosa succede a chi lo sta percorrendo: eliminarlo lo
   * toglie anche dalla loro home, ed è la conseguenza che non si vede da
   * questa schermata. */
  it('avverte le persone che lo stanno percorrendo', async () => {
    stato.paths = { data: [percorso({ assigned_count: 3 })], isPending: false, error: null }
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))

    expect(screen.getByText(/3 persone che lo stanno percorrendo/)).toBeInTheDocument()
    expect(screen.getByText(/test già svolti restano dove sono/)).toBeInTheDocument()
  })

  it('non parla di persone su un percorso mai assegnato', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))

    expect(screen.queryByText(/persone che lo stanno percorrendo/)).not.toBeInTheDocument()
  })

  it('elimina il percorso confermato', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))
    await userEvent.click(screen.getByRole('button', { name: 'Elimina il percorso' }))

    await waitFor(() => expect(deletePath.mutateAsync).toHaveBeenCalledWith('p-1'))
  })

  /* Un'eliminazione rifiutata lascia la conferma aperta con il motivo:
   * chiuderla farebbe credere che sia andata a buon fine. */
  it("mostra il motivo di un'eliminazione rifiutata", async () => {
    deletePath.error = new Error('Percorso in uso.')
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))

    expect(screen.getByText('Percorso in uso.')).toBeInTheDocument()
  })
})

describe("ritiro di un'assegnazione", () => {
  it('avverte di chi sparisce dalla home', async () => {
    renderPage()

    await userEvent.click(linguetta(/Assegnati/))
    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso di Anna Rossi' }))

    expect(screen.getByText(/sparisce dalla home di/)).toBeInTheDocument()
  })

  it('ritira il percorso confermato', async () => {
    renderPage()

    await userEvent.click(linguetta(/Assegnati/))
    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso di Anna Rossi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ritira il percorso' }))

    await waitFor(() => expect(deleteAssignment.mutateAsync).toHaveBeenCalledWith('as-1'))
  })
})

describe('caricamento ed errori', () => {
  it('mostra il caricamento dei percorsi', () => {
    stato.paths = { data: [], isPending: true, error: null }
    renderPage()

    expect(screen.getByText('Caricamento percorsi...')).toBeInTheDocument()
  })

  it('mostra il caricamento delle assegnazioni', async () => {
    stato.assignments = { data: [], isPending: true, error: null }
    renderPage()

    await userEvent.click(linguetta(/Assegnati/))

    expect(screen.getByText('Caricamento assegnazioni...')).toBeInTheDocument()
  })

  it("dice quando non c'è ancora nessun percorso", () => {
    stato.paths = { data: [], isPending: false, error: null }
    renderPage()

    expect(screen.getByText('Nessun percorso ancora composto')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito', () => {
    stato.paths = { data: [], isPending: false, error: new Error('Sessione scaduta.') }
    renderPage()

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    stato.paths = { data: [], isPending: false, error: 'guasto' }
    renderPage()

    expect(screen.getByText('Impossibile caricare i percorsi.')).toBeInTheDocument()
  })
})
