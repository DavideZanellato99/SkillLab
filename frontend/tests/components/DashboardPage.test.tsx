import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il guscio della sezione dashboard: le linguette con cui si passa da una
 * vista all'altra e i due filtri che valgono per tutte.
 *
 * Le viste hanno i loro test: qui si sostituiscono con una riga che stampa
 * quello che il guscio passa loro, così il banco resta a quello che il guscio
 * decide, cioè su quali righe si sta guardando e chi vede cosa. */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Prima org' }] }),
}))
/* Le linguette fanno partire il file della vista al passaggio del puntatore:
 * qui non c'è niente da scaricare, e un `import()` che si risolve dopo la
 * fine della prova la farebbe fallire per un motivo che non la riguarda. */
vi.mock('../../src/components/lazyPages', () => ({ prefetchPage: vi.fn() }))

import DashboardPage from '../../src/components/DashboardPage'
import { useDashboardScope } from '../../src/components/dashboardViews'

/** Una vista finta: dice cosa le è arrivato dal guscio. */
function VistaFinta({ nome }: { nome: string }) {
  const scope = useDashboardScope()
  return (
    <p data-testid="vista">
      {nome} · organizzazione={scope.organizationId || 'tutte'} · giorni={scope.days ?? 'sempre'} ·
      periodo={scope.period}
    </p>
  )
}

/** L'indirizzo, per leggere dove finiscono le scelte. */
function Indirizzo() {
  const { pathname, search } = useLocation()
  return <p data-testid="indirizzo">{`${pathname}${search}`}</p>
}

const indirizzo = () => screen.getByTestId('indirizzo').textContent ?? ''
const vista = () => screen.getByTestId('vista').textContent ?? ''

function renderDashboard(percorso = '/app/admin/dashboard/punteggi') {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Indirizzo />
      <Routes>
        <Route path="/app/admin/dashboard" element={<DashboardPage />}>
          <Route path="punteggi" element={<VistaFinta nome="punteggi" />} />
          <Route path="percorsi" element={<VistaFinta nome="percorsi" />} />
          <Route path="contenuti" element={<VistaFinta nome="contenuti" />} />
          <Route path="utilizzo" element={<VistaFinta nome="utilizzo" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({ user: { id: 'admin-1', ruolo: 'super_admin' } })
})

describe('le viste della sezione', () => {
  /* Quattro domande diverse sulle stesse prove, quindi quattro rotte: ognuna
   * ha il proprio indirizzo, che è quello che si può mandare a qualcuno. */
  it('porta a un indirizzo suo ogni vista', async () => {
    renderDashboard()

    await userEvent.click(screen.getByRole('tab', { name: 'Percorsi' }))

    expect(indirizzo()).toContain('/app/admin/dashboard/percorsi')
    expect(vista()).toContain('percorsi')
  })

  /* I filtri sono di tutta la sezione: ritrovarli accesi cambiando linguetta
   * è quello che rende le quattro viste una schermata sola. */
  it('si porta dietro i filtri cambiando vista', async () => {
    renderDashboard('/app/admin/dashboard/punteggi?periodo=30&organizzazione=org-1')

    await userEvent.click(screen.getByRole('tab', { name: 'Contenuti' }))

    expect(indirizzo()).toContain('periodo=30')
    expect(indirizzo()).toContain('organizzazione=org-1')
  })

  /* L'utilizzo confronta le organizzazioni fra loro, quindi ha senso solo per
   * chi ne guarda più di una: a un org admin la linguetta non si mostra
   * nemmeno, come fa il server che gli risponde 403. */
  it('non offre l’utilizzo a chi amministra una sola organizzazione', () => {
    useAuth.mockReturnValue({
      user: { id: 'admin-2', ruolo: 'organization_admin', organization_id: 'org-1' },
    })
    renderDashboard()

    expect(screen.getByRole('tab', { name: 'Punteggi' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Utilizzo' })).not.toBeInTheDocument()
  })

  /* Il titolo resta "Dashboard", ma la riga sotto dice a quale domanda
   * risponde quello che si sta guardando. */
  it('descrive la vista aperta', () => {
    renderDashboard('/app/admin/dashboard/percorsi')

    expect(screen.getByText(/su quale tappa si ferma il gruppo/)).toBeInTheDocument()
  })
})

describe('i filtri del guscio', () => {
  /* Il periodo e l'organizzazione sono i due filtri che il server capisce:
   * decidono quali righe arrivano, quindi il guscio li passa alla vista. */
  it('passa periodo e organizzazione alla vista', () => {
    renderDashboard('/app/admin/dashboard/punteggi?periodo=30&organizzazione=org-1')

    expect(vista()).toContain('organizzazione=org-1')
    expect(vista()).toContain('giorni=30')
  })

  it('senza periodo scelto la vista guarda tutto lo storico', () => {
    renderDashboard()

    expect(vista()).toContain('giorni=sempre')
  })

  /* Un valore inventato nell'indirizzo non deve lasciare la sezione senza
   * nessun periodo acceso. */
  it('ignora un periodo che non esiste', () => {
    renderDashboard('/app/admin/dashboard/punteggi?periodo=piccioni')

    expect(vista()).toContain('periodo=all')
  })

  /* A un org admin il server risponde comunque con la sua organizzazione: il
   * filtro non si mostra, e un id scritto a mano nell'indirizzo non conta. */
  it('non lascia scegliere l’organizzazione a chi ne amministra una', () => {
    useAuth.mockReturnValue({
      user: { id: 'admin-2', ruolo: 'organization_admin', organization_id: 'org-1' },
    })
    renderDashboard('/app/admin/dashboard/punteggi?organizzazione=org-9')

    expect(screen.queryByRole('combobox', { name: 'Organizzazione' })).not.toBeInTheDocument()
    expect(vista()).toContain('organizzazione=tutte')
  })

  it('scrive nell’indirizzo il periodo scelto', async () => {
    renderDashboard()

    await userEvent.click(screen.getByRole('radio', { name: '30 giorni' }))

    expect(indirizzo()).toContain('periodo=30')
  })

  /* Cambiando organizzazione la persona scelta non è più fra quelle in
   * elenco: resterebbe un filtro attivo su qualcuno che non c'è. */
  it('lascia andare la persona quando cambia l’organizzazione', async () => {
    renderDashboard('/app/admin/dashboard/punteggi?persona=u-1')

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Prima org' }))

    expect(indirizzo()).toContain('organizzazione=org-1')
    expect(indirizzo()).not.toContain('persona')
  })

  /* Azzerare riporta la sezione a tutta la storia e a tutte le
     organizzazioni, e la persona se ne va con loro: era scelta dentro
     l'elenco che l'organizzazione portava. */
  it('azzera periodo, organizzazione e persona', async () => {
    renderDashboard('/app/admin/dashboard/punteggi?periodo=30&organizzazione=org-1&persona=u-1')

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(indirizzo()).not.toContain('periodo')
    expect(indirizzo()).not.toContain('organizzazione')
    expect(indirizzo()).not.toContain('persona')
  })

  /* I filtri di una vista sola (il canale, il tipo di test) non sono
     dell'azzeramento: sono la prova di cui si stanno leggendo i grafici, non
     un modo di restringerli. */
  it('non tocca i filtri interni alla vista', async () => {
    renderDashboard('/app/admin/dashboard/punteggi?periodo=30&canale=text')

    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(indirizzo()).toContain('canale=text')
  })
})
