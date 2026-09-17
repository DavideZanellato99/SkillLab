import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PathAssignment, StepProgress, TrainingPath } from '../../src/services/training'
import DashboardAssignmentCards from '../../src/components/DashboardAssignmentCards'

const step = (
  over: Partial<StepProgress> & Pick<StepProgress, 'id' | 'position'>,
): StepProgress => ({
  kind: 'avatar',
  target_score: 7,
  criteria_targets: [],
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
  best_criteria_scores: {},
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

const percorso = (id: string, title: string): TrainingPath => ({
  id,
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title,
  description: null,
  steps: [],
  assigned_count: 1,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
})

function renderCards(
  schede: PathAssignment[] = [assegnazione()],
  showOrganization = false,
  percorsi: TrainingPath[] = [],
  pathFilter = '',
) {
  const onPathFilterChange = vi.fn()
  render(
    <DashboardAssignmentCards
      assignments={schede}
      paths={percorsi}
      pathFilter={pathFilter}
      onPathFilterChange={onPathFilterChange}
      showOrganization={showOrganization}
      pageResetKey=""
    />,
  )
  return { onPathFilterChange }
}

const ricerca = () => screen.getByPlaceholderText(/Cerca per utente/)

describe('la scheda', () => {
  it('dice chi sta percorrendo cosa e quanto le manca', () => {
    renderCards()

    expect(screen.getByRole('heading', { name: 'Anna Rossi' })).toBeInTheDocument()
    expect(screen.getByText('Onboarding')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/2 tappe')).toBeInTheDocument()
    expect(screen.getByText('In corso')).toBeInTheDocument()
  })

  /* Le tappe sono una fila di trattini, uno per tappa: si legge a che punto
   * è la persona senza leggere niente, e il nome resta nel tooltip. */
  it('mette in fila un trattino per tappa', () => {
    renderCards()

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  /* Senza una data in fondo sta il nome della tappa aperta: è comunque la
   * risposta a «dov'è». */
  it('scrive la tappa corrente quando non ha una scadenza', () => {
    renderCards()

    expect(screen.getByText('2. Avatar 2')).toBeInTheDocument()
  })

  /* Con una data, in fondo sta la scadenza con il suo tono: è la tappa su cui
   * si può ancora fare qualcosa, e chi guarda le schede cerca chi stringe. */
  it('scrive la scadenza della tappa corrente al posto del nome', () => {
    renderCards([
      assegnazione({
        steps: [step({ id: 's-1', position: 1, status: 'overdue', due_at: '2020-04-10T18:00:00' })],
        current_position: 1,
        status: 'overdue',
      }),
    ])

    expect(screen.getByText(/Scaduta il 10 apr/)).toBeInTheDocument()
    expect(screen.queryByText('1. Avatar 1')).not.toBeInTheDocument()
  })

  /* A percorso finito non c'è nessuna tappa corrente: si dice che sono tutte
   * superate invece di lasciare la scheda a metà, che sembrerebbe un dato
   * mancante. L'anello si chiude in verde e dice cento. */
  it('dice "Tutte superate" su un percorso chiuso', () => {
    renderCards([
      assegnazione({
        status: 'completed',
        current_position: null,
        completed_steps: 2,
        steps: [
          step({ id: 's-1', position: 1, status: 'completed' }),
          step({ id: 's-2', position: 2, status: 'completed' }),
        ],
      }),
    ])

    expect(screen.getByText('Tutte superate')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('lo dice quando il percorso non ha ancora tappe', () => {
    renderCards([assegnazione({ steps: [], completed_steps: 0, current_position: null })])

    expect(screen.getByText('Percorso senza tappe')).toBeInTheDocument()
    expect(screen.queryByText('Tutte superate')).not.toBeInTheDocument()
  })

  /* L'organizzazione si scrive solo a chi ne vede più di una: a un org
   * admin sarebbe la stessa parola su ogni scheda. */
  it("scrive l'organizzazione solo a chi ne vede più di una", () => {
    const { unmount } = render(
      <DashboardAssignmentCards
        assignments={[assegnazione()]}
        paths={[]}
        pathFilter=""
        onPathFilterChange={vi.fn()}
        showOrganization
        pageResetKey=""
      />,
    )
    expect(screen.getByText(/Banca Esempio/)).toBeInTheDocument()
    unmount()

    renderCards()
    expect(screen.queryByText(/Banca Esempio/)).not.toBeInTheDocument()
  })

  /* La dashboard legge e basta: il ritiro si fa dalla finestra di
   * assegnazione della scheda del percorso. */
  it('non offre di ritirare il percorso', () => {
    renderCards()

    expect(screen.queryByRole('button', { name: /Ritira/ })).not.toBeInTheDocument()
  })
})

describe('ricerca', () => {
  it('filtra per nome e per email', async () => {
    renderCards([
      assegnazione(),
      assegnazione({ id: 'as-2', user_name: 'Marco Bianchi', user_email: 'marco@test.it' }),
    ])

    await userEvent.type(ricerca(), 'marco')

    await waitFor(() => expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument())
    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
  })

  /* La ricerca guarda anche la parola dello stato e il nome della tappa
   * aperta, che sono quelle che si leggono sulla scheda: chi cerca "scaduto"
   * si aspetta di trovare chi è in ritardo. */
  it('trova per stato', async () => {
    renderCards([
      assegnazione(),
      assegnazione({ id: 'as-2', user_name: 'Marco Bianchi', status: 'overdue' }),
    ])

    await userEvent.type(ricerca(), 'scadut')

    await waitFor(() => expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument())
    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
  })

  it('trova per nome della tappa corrente', async () => {
    renderCards([
      assegnazione(),
      assegnazione({
        id: 'as-2',
        user_name: 'Marco Bianchi',
        steps: [step({ id: 's-9', position: 1, avatar_name: 'Cliente difficile' })],
        current_position: 1,
      }),
    ])

    await userEvent.type(ricerca(), 'difficile')

    await waitFor(() => expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument())
    expect(screen.getByText('Marco Bianchi')).toBeInTheDocument()
  })

  it('distingue una ricerca senza esiti da un elenco vuoto', async () => {
    renderCards()

    await userEvent.type(ricerca(), 'nessuno')
    await waitFor(() =>
      expect(screen.getByText('Nessun percorso corrisponde alla ricerca')).toBeInTheDocument(),
    )
  })

  it('spiega un elenco vuoto', () => {
    renderCards([])

    expect(
      screen.getByText('Nessun percorso assegnato per la selezione corrente'),
    ).toBeInTheDocument()
  })
})

/* La domanda che si fa dopo aver assegnato non è «dov'è Anna» ma «a che punto
 * sono i dodici che stanno facendo l'onboarding»: il filtro per percorso è
 * quella domanda, e ci si arriva anche dalla scheda del percorso. */
describe('filtro per percorso', () => {
  const dueSchede = [
    assegnazione(),
    assegnazione({
      id: 'as-2',
      path_id: 'p-2',
      path_title: 'Gestione reclami',
      user_id: 'u-2',
      user_name: 'Luca Verdi',
      user_email: 'luca@test.it',
    }),
  ]
  const duePercorsi = [percorso('p-1', 'Onboarding'), percorso('p-2', 'Gestione reclami')]

  it('tiene solo chi sta percorrendo quello scelto', () => {
    renderCards(dueSchede, false, duePercorsi, 'p-2')

    expect(screen.getByText('Luca Verdi')).toBeInTheDocument()
    expect(screen.queryByText('Anna Rossi')).not.toBeInTheDocument()
  })

  it('lascia scegliere quale guardare', async () => {
    const { onPathFilterChange } = renderCards(dueSchede, false, duePercorsi)

    await userEvent.click(screen.getByRole('combobox', { name: 'Percorso' }))
    await userEvent.click(screen.getByRole('option', { name: 'Gestione reclami' }))

    expect(onPathFilterChange).toHaveBeenCalledWith('p-2')
  })

  /* Con un percorso solo sarebbe una tendina che non toglie niente. */
  it('non compare quando i percorsi sono uno solo', () => {
    renderCards(dueSchede, false, [percorso('p-1', 'Onboarding')])

    expect(screen.queryByRole('combobox', { name: 'Percorso' })).not.toBeInTheDocument()
  })

  it('dice che quel percorso non lo sta percorrendo nessuno', () => {
    renderCards([assegnazione()], false, duePercorsi, 'p-2')

    expect(screen.getByText('Nessuno sta percorrendo «Gestione reclami»')).toBeInTheDocument()
  })
})

/* Con trenta persone una griglia di trenta schede è un muro da scorrere: si
 * sfoglia a pagine, come le schede dei percorsi nella gestione. */
describe('schede da sfogliare', () => {
  it('mostra una pagina per volta', async () => {
    renderCards(
      Array.from({ length: 24 }, (_, i) =>
        assegnazione({ id: `as-${i + 1}`, user_name: `Persona ${i + 1}` }),
      ),
    )

    expect(screen.getByText(/Da 1 a 20 di 24/)).toBeInTheDocument()
    expect(screen.queryByText('Persona 21')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pagina Successiva' }))

    expect(screen.getByText('Persona 21')).toBeInTheDocument()
  })
})
