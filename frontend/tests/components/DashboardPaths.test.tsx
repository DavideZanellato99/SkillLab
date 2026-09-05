import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La vista dei percorsi: quello che decide da sé, cioè come si leggono i
 * numeri di una tappa e quali scadenze finiscono in tabella.
 *
 * La lettura si sostituisce: qui si prova cosa la pagina fa dei numeri, non
 * come il server li calcola (quello sta in test_dashboards.py). */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const usePathsDashboard = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useDashboards', () => ({ usePathsDashboard }))

import DashboardPaths from '../../src/components/DashboardPaths'
import type { DashboardScope } from '../../src/components/dashboardViews'
import type { PathsDashboard } from '../../src/services/dashboards'

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
    paths: [
      {
        path_id: 'p-1',
        title: 'Onboarding vendite',
        organization_name: 'Prima org',
        assignments: 2,
        active: 1,
        completed: 1,
        completed_late: 0,
        overdue: 0,
        completion_rate: 50,
        avg_days_to_complete: 3.5,
        steps: [
          {
            position: 1,
            label: 'Cliente arrabbiato',
            kind: 'avatar',
            target_score: 7,
            reached: 2,
            passed: 1,
            late: 0,
            overdue: 0,
            avg_attempts: 1.5,
            avg_best_score: 6.8,
          },
          {
            position: 2,
            label: 'Procedure di cassa',
            kind: 'simulation',
            target_score: 6,
            reached: 0,
            passed: 0,
            late: 0,
            overdue: 0,
            avg_attempts: null,
            avg_best_score: null,
          },
        ],
      },
    ],
    deadlines: [],
    ...over,
  }
}

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

function renderPaths(
  scope: DashboardScope = { organizationId: '', days: undefined, period: 'all' },
) {
  render(
    <MemoryRouter initialEntries={['/app/admin/dashboard/percorsi']}>
      <Routes>
        <Route element={<Outlet context={scope} />}>
          <Route path="/app/admin/dashboard/percorsi" element={<DashboardPaths />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', ruolo: 'super_admin' } })
  readings()
})

describe('i numeri di un percorso', () => {
  it('porta lo scope del guscio alla lettura', () => {
    renderPaths({ organizationId: 'org-1', days: 30, period: '30' })

    expect(usePathsDashboard).toHaveBeenCalledWith('org-1', 30, true)
  })

  /* La quota di chiusura è la prima risposta della pagina: due percorsi
   * affidati e uno chiuso fanno cinquanta. */
  it('scrive la quota di chiusura e su quanti è calcolata', () => {
    renderPaths()

    expect(screen.getByText('Percorsi Chiusi')).toBeInTheDocument()
    expect(screen.getByText('1 su 2')).toBeInTheDocument()
  })

  /* Una tappa si misura su chi ci è arrivato: contarla su tutti gli
   * assegnatari direbbe che non funziona quando invece nessuno l'ha ancora
   * sbloccata. */
  it('dice su quante persone è calcolata una tappa', () => {
    renderPaths()

    expect(screen.getByText(/2 persone ci sono arrivate/)).toBeInTheDocument()
    expect(screen.getByText(/Nessuno ci è ancora arrivato/)).toBeInTheDocument()
  })
})

describe('le scadenze', () => {
  /* Sono l'unica cosa dell'applicazione che guarda avanti, e servono a
   * sapere su chi intervenire: senza la riga, una tappa scaduta si scopriva
   * aprendo le assegnazioni una per una. */
  it('mostra la tappa aperta con il suo stato', () => {
    readings({
      data: dashboard({
        deadlines: [
          {
            assignment_id: 'a-1',
            path_id: 'p-1',
            path_title: 'Onboarding vendite',
            user_id: 'u-1',
            user_name: 'Anna Rossi',
            user_email: 'anna@test.it',
            step_position: 1,
            step_label: 'Cliente arrabbiato',
            due_at: '2026-03-01T10:00:00Z',
            status: 'overdue',
          },
        ],
      }),
    })
    renderPaths()

    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByText('Scaduto')).toBeInTheDocument()
  })

  it('lo dice quando non ce ne sono', () => {
    renderPaths()

    expect(screen.getByText('Nessuna tappa aperta con un termine')).toBeInTheDocument()
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice invece di disegnare barre a zero', () => {
    readings({ data: dashboard({ assignments: 0, paths: [], people: 0 }) })
    renderPaths()

    expect(screen.getByText('Nessun percorso affidato')).toBeInTheDocument()
  })

  /* Con un periodo scelto il vuoto ha una causa probabile, e va detta. */
  it('con un periodo scelto suggerisce di allargarlo', () => {
    readings({ data: dashboard({ assignments: 0, paths: [], people: 0 }) })
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
