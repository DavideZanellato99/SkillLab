import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* La vista dei contenuti: le stesse prove della dashboard dei punteggi
 * guardate dal lato di chi le ha scritte.
 *
 * Qui si prova quello che la pagina decide: quale riga sta in cima, cosa
 * scrive accanto a una media, e che aprendo un test si arriva alle sue
 * domande. Come i numeri si calcolano è del server (test_dashboards.py). */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const useContentDashboard = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useDashboards', () => ({ useContentDashboard }))

vi.mock('../../src/components/DashboardSimulationItems', () => ({
  default: ({ simulationTitle }: { simulationTitle: string }) => (
    <div>domande di {simulationTitle}</div>
  ),
}))

import DashboardContent from '../../src/components/DashboardContent'
import type { DashboardScope } from '../../src/components/dashboardViews'
import type { ContentDashboard } from '../../src/services/dashboards'

const refetch = vi.fn()

function contenuti(over: Partial<ContentDashboard> = {}): ContentDashboard {
  return {
    criteria_labels: { empatia: 'Empatia' },
    avatars: [
      {
        avatar_id: 'a-1',
        avatar_name: 'Cliente ostile',
        conversations: 4,
        people: 2,
        avg_score: 4.5,
        below_pass: 3,
        weakest_criterion_key: 'empatia',
        weakest_criterion_avg: 3.2,
        criteria: { empatia: 3.2 },
        last_at: '2026-03-01T10:00:00Z',
      },
      {
        avatar_id: 'a-2',
        avatar_name: 'Cliente cortese',
        conversations: 2,
        people: 1,
        avg_score: 8.5,
        below_pass: 0,
        weakest_criterion_key: 'empatia',
        weakest_criterion_avg: 8,
        criteria: { empatia: 8 },
        last_at: '2026-03-02T10:00:00Z',
      },
    ],
    simulations: [
      {
        simulation_id: 's-1',
        simulation_title: 'Procedure di cassa',
        simulation_kind: 'multiple',
        simulation_source: 'manual',
        attempts: 5,
        people: 3,
        avg_score: 5.4,
        correct_rate: 62,
        below_pass: 2,
        last_at: '2026-03-03T10:00:00Z',
      },
    ],
    truncated: false,
    ...over,
  }
}

function readings({
  data = contenuti(),
  isPending = false,
  error = null as unknown,
}: { data?: ContentDashboard | undefined; isPending?: boolean; error?: unknown } = {}) {
  useContentDashboard.mockReturnValue({
    data,
    isPending,
    isPlaceholderData: false,
    error,
    refetch,
  })
}

function renderContent(
  percorso = '/app/admin/dashboard/contenuti',
  scope: DashboardScope = { organizationId: '', days: undefined, period: 'all' },
) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route element={<Outlet context={scope} />}>
          <Route path="/app/admin/dashboard/contenuti" element={<DashboardContent />} />
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

describe('cosa è tarato male', () => {
  /* La riga su cui si va peggio è la risposta della pagina: sta in cima e
   * anche nella card, perché cercarla nella tabella sarebbe il contrario. */
  it('mette in evidenza l’avatar e il test più duri', () => {
    renderContent()

    expect(screen.getByText('Avatar Più Duro')).toBeInTheDocument()
    expect(screen.getAllByText('Cliente ostile').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Procedure di cassa').length).toBeGreaterThan(0)
  })

  /* La media dice che si va male, il criterio dice su cosa: è la differenza
   * fra sapere che qualcosa non funziona e sapere cosa cambiare. */
  it('scrive il criterio più debole accanto alla media', () => {
    renderContent()

    expect(screen.getAllByText('Empatia').length).toBeGreaterThan(0)
  })

  it('porta lo scope del guscio alla lettura', () => {
    renderContent('/app/admin/dashboard/contenuti', {
      organizationId: 'org-1',
      days: 90,
      period: '90',
    })

    expect(useContentDashboard).toHaveBeenCalledWith('org-1', 90, true)
  })
})

describe('i test tecnici', () => {
  /* Avatar e test sono due mestieri diversi di chi scrive i contenuti, e la
   * scelta sta nell'indirizzo come ogni altra della dashboard. */
  it('apre la metà dei test da indirizzo', () => {
    renderContent('/app/admin/dashboard/contenuti?contenuto=test')

    expect(screen.getByRole('tab', { name: /Test tecnici/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('62%')).toBeInTheDocument()
  })

  /* Una domanda che sbagliano tutti in una media di dieci non si vede: si
   * apre la riga e si guardano le domande una per una. */
  it('apre le domande di un test dalla sua riga', async () => {
    renderContent('/app/admin/dashboard/contenuti?contenuto=test')

    // Il titolo compare anche nella card in cima: qui si apre la riga
    const riga = screen.getAllByText('Procedure di cassa').at(-1)!
    await userEvent.click(riga)

    expect(screen.getByText('domande di Procedure di cassa')).toBeInTheDocument()
  })
})

describe('quando non c’è niente da mostrare', () => {
  it('lo dice invece di mostrare due tabelle vuote', () => {
    readings({ data: contenuti({ avatars: [], simulations: [] }) })
    renderContent()

    expect(screen.getByText('Nessun contenuto ancora affrontato')).toBeInTheDocument()
  })

  it('offre di riprovare quando la lettura cade', () => {
    readings({ data: undefined, error: new Error('Server non raggiungibile.') })
    renderContent()

    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  /* Le medie sono di una parte dello storico: dirlo è la differenza fra una
   * pagina che si sa incompleta e dei numeri parziali letti come tutti. */
  it('avverte quando le prove sono troppe per essere lette in una volta', () => {
    readings({ data: contenuti({ truncated: true }) })
    renderContent()

    expect(screen.getByText(/calcolate sulle più recenti/)).toBeInTheDocument()
  })
})
