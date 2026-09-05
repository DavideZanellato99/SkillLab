import { render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La vista dell'utilizzo: quali organizzazioni si allenano e quali sono
 * ferme.
 *
 * Il numero che conta è il rapporto fra chi c'è e chi ha svolto almeno una
 * prova, e una riga a zero è una risposta: è quello che qui si prova. */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const useUsageDashboard = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useDashboards', () => ({ useUsageDashboard }))

import DashboardUsage from '../../src/components/DashboardUsage'
import type { DashboardScope } from '../../src/components/dashboardViews'
import type { UsageDashboard } from '../../src/services/dashboards'

const refetch = vi.fn()

function utilizzo(over: Partial<UsageDashboard> = {}): UsageDashboard {
  return {
    organizations: [
      {
        organization_id: 'org-1',
        organization_name: 'Prima org',
        people: 10,
        active_people: 4,
        conversations: 12,
        voice_conversations: 8,
        text_conversations: 4,
        attempts: 5,
        total_duration_seconds: 3660,
        last_activity_at: '2026-03-01T10:00:00Z',
      },
      {
        organization_id: 'org-2',
        organization_name: 'Org ferma',
        people: 6,
        active_people: 0,
        conversations: 0,
        voice_conversations: 0,
        text_conversations: 0,
        attempts: 0,
        total_duration_seconds: 0,
        last_activity_at: null,
      },
    ],
    people: 16,
    active_people: 4,
    conversations: 12,
    attempts: 5,
    total_duration_seconds: 3660,
    daily: [{ day: '2026-03-01', conversations: 12, attempts: 5 }],
    ...over,
  }
}

function readings({
  data = utilizzo(),
  isPending = false,
  error = null as unknown,
}: { data?: UsageDashboard | undefined; isPending?: boolean; error?: unknown } = {}) {
  useUsageDashboard.mockReturnValue({
    data,
    isPending,
    isPlaceholderData: false,
    error,
    refetch,
  })
}

function renderUsage(
  scope: DashboardScope = { organizationId: '', days: undefined, period: 'all' },
) {
  render(
    <MemoryRouter initialEntries={['/app/admin/dashboard/utilizzo']}>
      <Routes>
        <Route element={<Outlet context={scope} />}>
          <Route path="/app/admin/dashboard/utilizzo" element={<DashboardUsage />} />
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

describe('chi sta usando la piattaforma', () => {
  /* Cento account di cui tre si allenano sono una licenza che non sta
   * servendo, e il solo conteggio delle prove non lo direbbe. */
  it('scrive quante persone si allenano sul totale', () => {
    renderUsage()

    expect(screen.getByText('Persone che si Allenano')).toBeInTheDocument()
    expect(screen.getByText('/ 16')).toBeInTheDocument()
  })

  /* Un elenco delle sole organizzazioni attive nasconderebbe esattamente
   * quelle che si stanno cercando. */
  it('tiene in elenco anche una organizzazione ferma', () => {
    renderUsage()

    expect(screen.getAllByText('Org ferma').length).toBeGreaterThan(0)
    expect(screen.getByText('0 / 6')).toBeInTheDocument()
  })

  it('porta il periodo del guscio alla lettura', () => {
    renderUsage({ organizationId: '', days: 7, period: '7' })

    expect(useUsageDashboard).toHaveBeenCalledWith(7, true)
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice se non esiste nessuna organizzazione', () => {
    readings({ data: utilizzo({ organizations: [] }) })
    renderUsage()

    expect(screen.getByText('Nessuna organizzazione')).toBeInTheDocument()
  })

  it('offre di riprovare quando la lettura cade', () => {
    readings({ data: undefined, error: new Error('Server non raggiungibile.') })
    renderUsage()

    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })
})
