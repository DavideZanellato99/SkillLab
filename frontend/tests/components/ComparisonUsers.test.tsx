import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il secondo riquadro del confronto: le medie delle persone scelte.
 *
 * Quello che decide da sé: che parte vuoto, di chi sono le barre, cosa
 * legge a seconda della prova e cosa chiede al super admin prima di
 * disegnare. Le barre sono quelle di scoreCharts, che ha i suoi test. */

const useAuth = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useAuth', () => ({ useAuth }))

const useEvaluationsReport = vi.hoisted(() => vi.fn())
const useSimulationsReport = vi.hoisted(() => vi.fn())
vi.mock('../../src/hooks/useReports', () => ({ useEvaluationsReport, useSimulationsReport }))

vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Prima org' }] }),
}))

import ComparisonUsers from '../../src/components/ComparisonUsers'
import type { EvaluationReportRow, SimulationReportRow } from '../../src/services/admin'

function valutazione(over: Partial<EvaluationReportRow> = {}): EvaluationReportRow {
  return {
    conversation_id: 'c-1',
    conversation_title: 'Reclamo carta',
    mode: 'voice',
    user_id: 'u-1',
    user_email: 'anna@test.it',
    user_nome: 'Anna',
    user_cognome: 'Ferrari',
    organization_id: 'org-1',
    organization_name: 'Prima org',
    avatar_id: 'a-1',
    avatar_name: 'Cliente arrabbiato',
    conversation_at: '2026-03-01T10:00:00Z',
    evaluated_at: '2026-03-01T10:30:00Z',
    overall_score: 7,
    ai_overall_score: 7,
    has_override: false,
    has_review: false,
    criteria: { ascolto: 7 },
    ...over,
  }
}

function tentativo(over: Partial<SimulationReportRow> = {}): SimulationReportRow {
  return {
    attempt_id: 't-1',
    simulation_id: 'sim-1',
    simulation_title: 'Procedure di sportello',
    simulation_kind: 'multiple',
    simulation_source: 'ai',
    user_id: 'u-1',
    user_email: 'anna@test.it',
    user_nome: 'Anna',
    user_cognome: 'Ferrari',
    organization_id: 'org-1',
    organization_name: 'Prima org',
    attempted_at: '2026-02-01T10:00:00Z',
    correct_count: 10,
    question_count: 10,
    score: 10,
    ...over,
  }
}

/* Due persone, due canali: Anna ha una chiamata da 9 e una chat da 5, Marco
 * una chiamata da 4. */
const dueUtenti: EvaluationReportRow[] = [
  valutazione({ conversation_id: 'c-1', overall_score: 9 }),
  valutazione({ conversation_id: 'c-2', mode: 'text', overall_score: 5 }),
  valutazione({
    conversation_id: 'c-3',
    user_id: 'u-2',
    user_email: 'marco@test.it',
    user_nome: 'Marco',
    user_cognome: 'Bianchi',
    overall_score: 4,
  }),
]

const refetch = vi.fn()

/** Cosa rispondono le due letture: pronte e vuote, se non si dice altro. */
function reports({
  rows = [] as EvaluationReportRow[],
  simulations = [] as SimulationReportRow[],
  truncated = false,
  isLoading = false,
  error = null as unknown,
} = {}) {
  useEvaluationsReport.mockReturnValue({
    data: { criteria_labels: {}, rows, truncated },
    isLoading,
    error,
    refetch,
  })
  useSimulationsReport.mockReturnValue({
    data: { rows: simulations, truncated: false },
    isLoading,
    error: null,
    refetch,
  })
}

function Indirizzo() {
  const { search } = useLocation()
  return <p data-testid="indirizzo">{search}</p>
}
const indirizzo = () => screen.getByTestId('indirizzo').textContent ?? ''

function renderUsers(
  percorso = '/app/confronto',
  prova: 'conversazioni' | 'simulazioni' = 'conversazioni',
) {
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Indirizzo />
      <ComparisonUsers prova={prova} onProvaChange={vi.fn()} sectionTabs={null} />
    </MemoryRouter>,
  )
}

/* Il contenuto della sezione sta nel pannello della linguetta della prova:
   sopra ci sono il titolo di pagina e il campo delle persone. */
const riquadro = () => screen.getByRole('tabpanel')
const campoPersone = () => screen.getByRole('combobox', { name: 'Utenti' })

beforeEach(() => {
  vi.clearAllMocks()
  useAuth.mockReturnValue({
    user: { id: 'admin-1', ruolo: 'organization_admin', organization_id: 'org-1' },
  })
  reports({ rows: dueUtenti })
})

/* Non è la dashboard, dove senza scelte il grafico era di tutti: qui si
 * viene per scegliere, e trenta barre aperte prima di aver scelto nessuno
 * sarebbero la classifica dell'aula. */
describe('le persone si scelgono', () => {
  it('parte vuoto e dice cosa fare', () => {
    renderUsers()

    expect(within(riquadro()).getByText('Nessuna persona selezionata')).toBeInTheDocument()
    expect(within(riquadro()).getByText(/Cerca e scegli le persone/)).toBeInTheDocument()
    expect(within(riquadro()).queryByText('Anna Ferrari')).not.toBeInTheDocument()
  })

  it('scegliere una persona la disegna e la scrive nell’indirizzo', async () => {
    renderUsers()

    await userEvent.click(campoPersone())
    await userEvent.click(screen.getByRole('option', { name: /Anna Ferrari/ }))

    expect(within(riquadro()).getByText('Anna Ferrari')).toBeInTheDocument()
    expect(within(riquadro()).getByText('2 valutazioni')).toBeInTheDocument()
    expect(within(riquadro()).queryByText('Marco Bianchi')).not.toBeInTheDocument()
    expect(indirizzo()).toContain('confronto=u-1')
  })

  it('riapre sulle persone che l’indirizzo porta con sé', () => {
    renderUsers('/app/confronto?confronto=u-1,u-2')

    const barre = within(riquadro())
      .getAllByText(/Anna Ferrari|Marco Bianchi/)
      .map((n) => n.textContent)
    // Dalla media più alta: Anna (9 + 5) / 2, Marco 4
    expect(barre).toEqual(['Anna Ferrari', 'Marco Bianchi'])
  })

  /* Le barre stanno dalla media più alta, la tendina per cognome, come ogni
   * elenco in cui un nome si cerca. */
  it('elenca le persone per cognome nella tendina', async () => {
    renderUsers()

    await userEvent.click(campoPersone())
    const voci = screen.getAllByRole('option').map((o) => o.textContent)
    expect(voci[0]).toContain('Marco Bianchi')
    expect(voci[1]).toContain('Anna Ferrari')
  })
})

describe('la prova e i suoi filtri', () => {
  it('il canale restringe le medie', async () => {
    renderUsers('/app/confronto?confronto=u-1')

    await userEvent.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(within(riquadro()).getByText('1 valutazione')).toBeInTheDocument()
  })

  it('un filtro che lascia fuori tutti gli scelti lo dice', async () => {
    renderUsers('/app/confronto?confronto=u-2')

    await userEvent.click(screen.getByRole('radio', { name: 'Chat' }))

    expect(within(riquadro()).getByText(/Nessuna prova per le persone scelte/)).toBeInTheDocument()
  })

  it('sui test tecnici legge i tentativi e conta quelli', () => {
    reports({
      simulations: [tentativo({ attempt_id: 't-1' }), tentativo({ attempt_id: 't-2', score: 6 })],
    })
    renderUsers('/app/confronto?confronto=u-1', 'simulazioni')

    expect(within(riquadro()).getByText('2 tentativi')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Tutti' })).toBeInTheDocument()
  })

  it('legge solo la prova della linguetta aperta', () => {
    renderUsers('/app/confronto', 'simulazioni')

    expect(useEvaluationsReport).toHaveBeenCalledWith('', undefined, false)
    expect(useSimulationsReport).toHaveBeenCalledWith('', undefined, true)
  })

  it('senza nessuna prova lo dice invece di chiedere di scegliere', () => {
    reports()
    renderUsers()

    expect(
      within(riquadro()).getByText(/Nessuna conversazione ancora valutata/),
    ).toBeInTheDocument()
    expect(within(riquadro()).queryByText(/Cerca e scegli/)).not.toBeInTheDocument()
  })

  it('dice quando le medie sono delle sole prove più recenti', () => {
    reports({ rows: dueUtenti, truncated: true })
    renderUsers('/app/confronto?confronto=u-1')

    expect(screen.getByText(/calcolate sulle più recenti/)).toBeInTheDocument()
  })
})

/* Due persone di organizzazioni diverse si allenano su avatar e test
 * diversi: le loro medie non stanno sulla stessa scala, quindi il super
 * admin sceglie prima una organizzazione. */
describe('il super admin', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: { id: 'admin-0', ruolo: 'super_admin' } })
  })

  it('sceglie prima una organizzazione', () => {
    renderUsers()

    expect(
      screen.getByText(/Scegli una organizzazione per mettere a confronto/),
    ).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/persone da confrontare/)).not.toBeInTheDocument()
    expect(useEvaluationsReport).toHaveBeenCalledWith('', undefined, false)
  })

  it('con una organizzazione scelta il comando c’è e legge la sua gente', () => {
    renderUsers('/app/confronto?organizzazione=org-1')

    expect(campoPersone()).toBeInTheDocument()
    expect(useEvaluationsReport).toHaveBeenCalledWith('org-1', undefined, true)
  })

  it('cambiando organizzazione le persone scelte se ne vanno', async () => {
    renderUsers('/app/confronto?confronto=u-1')

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Prima org' }))

    expect(indirizzo()).toContain('organizzazione=org-1')
    expect(indirizzo()).not.toContain('confronto')
  })
})

describe('caricamento ed errori', () => {
  it('aspetta le prove', () => {
    reports({ isLoading: true })
    renderUsers()

    expect(screen.getByText('Caricamento prove...')).toBeInTheDocument()
  })

  it('riporta il motivo di un caricamento fallito e offre di riprovare', async () => {
    reports({ error: new Error('Sessione scaduta.') })
    renderUsers()

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(refetch).toHaveBeenCalled()
  })
})
