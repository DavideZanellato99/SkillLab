import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La vista dei percorsi: quello che decide da sé, cioè come si leggono i
 * quattro numeri e quali righe finiscono nella tabella sotto.
 *
 * Le letture si sostituiscono: qui si prova cosa la pagina fa dei numeri,
 * non come il server li calcola (quello sta in test_dashboards.py). */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const usePathsDashboard = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useDashboards', () => ({ usePathsDashboard }))

const stato = vi.hoisted(() => ({
  assignments: { data: [] as unknown[], isPending: false, error: null as unknown },
  paths: { data: [] as unknown[] },
}))
const ricaricaAssegnazioni = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useTraining', () => ({
  useAssignments: () => ({ ...stato.assignments, refetch: ricaricaAssegnazioni }),
  usePaths: () => stato.paths,
}))

import DashboardPaths from '../../src/components/DashboardPaths'
import type { DashboardScope } from '../../src/components/dashboardViews'
import type { PathsDashboard } from '../../src/services/dashboards'
import type { PathAssignment, TrainingPath } from '../../src/services/training'

const refetch = vi.fn()

function dashboard(over: Partial<PathsDashboard> = {}): PathsDashboard {
  return {
    assignments: 2,
    people: 2,
    active: 1,
    completed: 1,
    completed_late: 0,
    overdue: 0,
    completion_rate: 50,
    avg_days_to_complete: 3.5,
    ...over,
  }
}

const assegnazione = (over: Partial<PathAssignment> = {}): PathAssignment => ({
  id: 'as-1',
  path_id: 'p-1',
  path_title: 'Onboarding vendite',
  path_description: null,
  user_id: 'u-1',
  user_name: 'Anna Rossi',
  user_email: 'anna@test.it',
  organization_id: 'org-1',
  organization_name: 'Prima org',
  created_at: '2026-03-01T10:00:00Z',
  assigned_by_name: null,
  status: 'active',
  steps: [],
  completed_steps: 0,
  current_position: null,
  ...over,
})

const percorso = (id: string, title: string): TrainingPath => ({
  id,
  organization_id: 'org-1',
  organization_name: 'Prima org',
  title,
  description: null,
  steps: [],
  assigned_count: 1,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
})

function readings({
  data = dashboard(),
  isPending = false,
  error = null as unknown,
}: { data?: PathsDashboard | undefined; isPending?: boolean; error?: unknown } = {}) {
  usePathsDashboard.mockReturnValue({
    data,
    isPending,
    isPlaceholderData: false,
    error,
    refetch,
  })
}

/* L'indirizzo che la vista scrive: il filtro per percorso sta lì e non in
 * memoria, quindi si legge da lì. */
function Indirizzo() {
  const { search } = useLocation()
  return <output data-testid="indirizzo">{search}</output>
}

function renderPaths(
  scope: DashboardScope = { organizationId: '', days: undefined, period: 'all' },
  search = '',
) {
  render(
    <MemoryRouter initialEntries={[`/app/admin/dashboard/percorsi${search}`]}>
      <Routes>
        <Route element={<Outlet context={scope} />}>
          <Route
            path="/app/admin/dashboard/percorsi"
            element={
              <>
                <DashboardPaths />
                <Indirizzo />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', ruolo: 'super_admin' } })
  readings()
  stato.assignments = { data: [assegnazione()], isPending: false, error: null }
  stato.paths = { data: [percorso('p-1', 'Onboarding vendite')] }
})

describe('i quattro numeri', () => {
  it('porta lo scope del guscio alla lettura', () => {
    renderPaths({ organizationId: 'org-1', days: 30, period: '30' })

    expect(usePathsDashboard).toHaveBeenCalledWith('org-1', 30, true)
  })

  /* La quota di chiusura è la prima risposta della pagina: due percorsi
   * assegnati e uno chiuso fanno cinquanta. */
  it('scrive la quota di chiusura e su quanti è calcolata', () => {
    renderPaths()

    expect(screen.getByText('Percorsi Assegnati')).toBeInTheDocument()
    expect(screen.getByText('Percorsi Chiusi')).toBeInTheDocument()
    expect(screen.getByText('1 su 2')).toBeInTheDocument()
  })

  it('scrive il tempo medio di chiusura in giorni', () => {
    renderPaths()

    expect(screen.getByText('3,5 giorni')).toBeInTheDocument()
  })

  /* Finché nessuno ha chiuso un percorso il tempo non è zero: non c'è. */
  it('lascia vuoto il tempo medio finché nessuno ha chiuso', () => {
    readings({ data: dashboard({ completed: 0, completion_rate: 0, avg_days_to_complete: null }) })
    renderPaths()

    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('chi sta percorrendo cosa', () => {
  it('mette sotto i numeri le schede delle assegnazioni', () => {
    renderPaths()

    expect(screen.getByText('Chi sta percorrendo cosa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anna Rossi' })).toBeInTheDocument()
  })

  /* Il periodo della sezione vale anche per le righe: i quattro numeri
   * contano le assegnazioni fatte negli ultimi N giorni, e una tabella che
   * sotto ne mostrasse altre li smentirebbe. */
  it('tiene solo le assegnazioni fatte nel periodo', () => {
    const ieri = new Date(Date.now() - 86_400_000).toISOString()
    stato.assignments = {
      data: [
        assegnazione({
          id: 'as-vecchia',
          user_name: 'Anna Rossi',
          created_at: '2020-01-01T10:00:00Z',
        }),
        assegnazione({ id: 'as-nuova', user_name: 'Luca Verdi', created_at: ieri }),
      ],
      isPending: false,
      error: null,
    }
    renderPaths({ organizationId: '', days: 7, period: '7' })

    expect(screen.getByText('Luca Verdi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  /* Il percorso scelto sta nell'indirizzo: ci si arriva dalla scheda del
   * percorso nella gestione, e un collegamento mandato a qualcuno deve
   * aprire la stessa tabella. */
  it('legge il percorso da guardare dall’indirizzo', () => {
    stato.assignments = {
      data: [
        assegnazione(),
        assegnazione({
          id: 'as-2',
          path_id: 'p-2',
          path_title: 'Gestione reclami',
          user_name: 'Luca Verdi',
        }),
      ],
      isPending: false,
      error: null,
    }
    stato.paths = {
      data: [percorso('p-1', 'Onboarding vendite'), percorso('p-2', 'Gestione reclami')],
    }
    renderPaths(undefined, '?percorso=p-2')

    expect(screen.getByText('Luca Verdi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  it('scrive nell’indirizzo il percorso scelto dalla tendina', async () => {
    stato.paths = {
      data: [percorso('p-1', 'Onboarding vendite'), percorso('p-2', 'Gestione reclami')],
    }
    renderPaths()

    await userEvent.click(screen.getByRole('combobox', { name: 'Percorso' }))
    await userEvent.click(screen.getByRole('option', { name: 'Gestione reclami' }))

    expect(screen.getByTestId('indirizzo')).toHaveTextContent('percorso=p-2')
  })

  /* Le righe hanno la loro lettura e il loro errore, separati dai quattro
   * numeri: un elenco caduto non è una dashboard vuota. */
  it('offre di riprovare quando le righe non arrivano, tenendo i numeri', async () => {
    stato.assignments = { data: [], isPending: false, error: new Error('Elenco non letto.') }
    renderPaths()

    expect(screen.getByText('1 su 2')).toBeInTheDocument()
    expect(screen.getByText('Elenco non letto.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(ricaricaAssegnazioni).toHaveBeenCalledOnce()
  })
})

describe('il nome dell’organizzazione', () => {
  /* A chi guarda più tenant il nome dice di chi è il percorso; a chi
   * amministra il proprio è la stanza in cui si trova già, e non si scrive. */
  it('compare al super admin', () => {
    renderPaths()

    expect(screen.getByText(/Prima org/)).toBeInTheDocument()
  })

  it('non compare a chi amministra una sola organizzazione', () => {
    useAuth.mockReturnValue({
      user: { id: 'admin-2', ruolo: 'organization_admin', organization_id: 'org-1' },
    })
    renderPaths()

    expect(screen.queryByText(/Prima org/)).not.toBeInTheDocument()
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice invece di disegnare numeri a zero', () => {
    readings({ data: dashboard({ assignments: 0, people: 0 }) })
    renderPaths()

    expect(screen.getByText('Nessun percorso assegnato')).toBeInTheDocument()
    expect(screen.queryByText('Chi sta percorrendo cosa')).not.toBeInTheDocument()
  })

  /* Con un periodo scelto il vuoto ha una causa probabile, e va detta. */
  it('con un periodo scelto suggerisce di allargarlo', () => {
    readings({ data: dashboard({ assignments: 0, people: 0 }) })
    renderPaths({ organizationId: '', days: 7, period: '7' })

    expect(screen.getByText(/scegline uno più ampio/)).toBeInTheDocument()
  })

  it('offre di riprovare quando la lettura cade', () => {
    readings({ data: undefined, error: new Error('Server non raggiungibile.') })
    renderPaths()

    expect(screen.getByText('Server non raggiungibile.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })
})
