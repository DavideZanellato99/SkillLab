import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessione = vi.hoisted(() => ({
  current: { ruolo: 'super_admin', organization_id: 'org-1' as string | null },
}))
vi.mock('../../src/hooks/useAuth', () => ({ useAuth: () => ({ user: sessione.current }) }))

const ricaricaPercorsi = vi.hoisted(() => vi.fn())
const stato = vi.hoisted(() => ({
  paths: { data: [] as unknown[], isPending: false, error: null as unknown },
}))
const deletePath = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))
vi.mock('../../src/hooks/useTraining', () => ({
  usePaths: () => ({ ...stato.paths, refetch: ricaricaPercorsi }),
  useDeletePath: () => deletePath,
}))
vi.mock('../../src/hooks/useOrganizations', () => ({
  useOrganizations: () => ({ data: [{ id: 'org-1', name: 'Banca Esempio' }] }),
}))

/* Le due modali hanno i loro moduli e i loro test: qui sostituirle tiene il
 * banco a quello che la pagina decide, cioè quando si aprono. */
vi.mock('../../src/components/TrainingPathEditorModal', () => ({
  default: ({
    path,
    defaultOrganizationId,
  }: {
    path: { title?: string } | null
    defaultOrganizationId: string | null
  }) => (
    <div>
      <span>editor: {path?.title ?? 'nuovo percorso'}</span>
      {/* In due scritte separate: l'organizzazione di partenza si prova da
          sola, senza infilarsi dentro la riga che dice quale percorso si sta
          aprendo. */}
      <span>org: {defaultOrganizationId ?? 'nessuna'}</span>
    </div>
  ),
}))
vi.mock('../../src/components/AssignPathModal', () => ({
  default: ({ path }: { path: { title: string } }) => <div>assegna: {path.title}</div>,
}))

import type { TrainingPath } from '../../src/services/training'
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

/* Dove la pagina manda: la scheda di un percorso porta alla dashboard, e
 * quello che conta è l'indirizzo con cui ci arriva. */
function Indirizzo() {
  const { pathname, search } = useLocation()
  return <output data-testid="indirizzo">{`${pathname}${search}`}</output>
}

function renderPage(ruolo = 'super_admin', organizationId: string | null = 'org-1') {
  sessione.current = { ruolo, organization_id: organizationId }
  render(
    <MemoryRouter initialEntries={['/app/admin/training']}>
      <Routes>
        <Route path="/app/admin/training" element={<TrainingPage />} />
        <Route path="*" element={<Indirizzo />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  stato.paths = { data: [percorso()], isPending: false, error: null }
  deletePath.mutateAsync.mockReset()
  deletePath.mutateAsync.mockResolvedValue({ success: true })
  deletePath.reset.mockReset()
  deletePath.isPending = false
  deletePath.error = null
})

/* La pagina è dei percorsi e basta: a che punto è la propria gente sta
 * nella dashboard, nella vista dei percorsi. */
describe('la pagina', () => {
  it('mostra le schede dei percorsi, senza linguette', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

/* Un elenco che cresce di una scheda a settimana diventa un muro da scorrere,
 * e chi arriva qui di solito sa già quale percorso vuole toccare. */
describe('ricerca fra i percorsi', () => {
  const trePercorsi = [
    percorso(),
    percorso({ id: 'p-2', title: 'Gestione reclami' }),
    percorso({
      id: 'p-3',
      title: 'Vendita consulenziale',
      steps: [
        {
          id: 's-1',
          position: 1,
          kind: 'avatar',
          target_score: 7,
          criteria_targets: [],
          due_at: null,
          avatar_id: 'a-1',
          avatar_name: 'Cliente esigente',
          avatar_category: 'Clienti',
          avatar_category_color: 'violet',
          simulation_id: null,
          simulation_title: null,
          simulation_kind: null,
        },
      ],
    }),
  ]

  const cerca = async (testo: string) => {
    stato.paths = { data: trePercorsi, isPending: false, error: null }
    renderPage()
    await userEvent.type(screen.getByRole('textbox', { name: 'Cerca fra i percorsi' }), testo)
  }

  it('tiene solo i percorsi che corrispondono', async () => {
    await cerca('reclami')

    expect(screen.getByRole('heading', { name: 'Gestione reclami' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Onboarding' })).not.toBeInTheDocument()
  })

  /* Chi cerca un avatar sta cercando i percorsi che lo attraversano. */
  it('cerca anche nei nomi delle tappe', async () => {
    await cerca('esigente')

    expect(screen.getByRole('heading', { name: 'Vendita consulenziale' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gestione reclami' })).not.toBeInTheDocument()
  })

  it('dice quando la ricerca non trova nulla', async () => {
    await cerca('assicurazioni')

    expect(screen.getByText('Nessun percorso corrisponde alla ricerca')).toBeInTheDocument()
  })

  /* La ricerca è dei percorsi: senza percorsi non c'è niente in cui cercare,
   * e resta il solo invito a comporne uno. */
  it("non compare quando non c'è ancora nessun percorso", () => {
    stato.paths = { data: [], isPending: false, error: null }
    renderPage()

    expect(screen.queryByRole('textbox', { name: 'Cerca fra i percorsi' })).not.toBeInTheDocument()
  })
})

describe('percorsi da sfogliare', () => {
  it('mostra una pagina per volta', async () => {
    stato.paths = {
      data: Array.from({ length: 24 }, (_, i) =>
        percorso({ id: `p-${i + 1}`, title: `Percorso ${i + 1}` }),
      ),
      isPending: false,
      error: null,
    }
    renderPage()

    expect(screen.getByText(/Da 1 a 20 di 24/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Percorso 21' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pagina Successiva' }))

    expect(screen.getByRole('heading', { name: 'Percorso 21' })).toBeInTheDocument()
  })
})

/* Il filtro per organizzazione ha senso solo per il super admin, che è
 * l'unico a vederne più di una: a un org admin sarebbe una tendina con
 * dentro la sua sola organizzazione. */
describe('filtro per organizzazione', () => {
  it("c'è per il super admin", () => {
    renderPage()

    expect(screen.getByText('Tutte le organizzazioni')).toBeInTheDocument()
  })

  it("non c'è per un org admin", () => {
    renderPage('organization_admin')

    expect(screen.queryByText('Tutte le organizzazioni')).not.toBeInTheDocument()
  })

  /* La fascia sta sotto l'intestazione come in ogni altro elenco, e porta il
     pulsante che l'azzera: compare solo quando c'è qualcosa da azzerare. */
  it('azzera il filtro e torna a tutte le organizzazioni', async () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Azzera Filtri' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))
    await userEvent.click(screen.getByRole('button', { name: 'Azzera Filtri' }))

    expect(screen.getByRole('combobox', { name: 'Organizzazione' })).toHaveTextContent(
      'Tutte le organizzazioni',
    )
  })
})

/* Le due pagine restano legate: dal numero di chi sta percorrendo un
 * percorso si arriva a chi sono, che è la domanda che quel numero fa
 * venire, nella dashboard già ristretta su quel percorso. */
describe('dalla scheda a chi lo sta percorrendo', () => {
  beforeEach(() => {
    stato.paths = { data: [percorso({ assigned_count: 1 })], isPending: false, error: null }
  })

  /* Il super admin ci arriva anche con l'organizzazione del percorso, che è
   * quella in cui la tendina di là lo offre. */
  it('porta alla dashboard dei percorsi, ristretta su quello e sulla sua organizzazione', async () => {
    renderPage()

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostra chi sta percorrendo Onboarding' }),
    )

    expect(screen.getByTestId('indirizzo')).toHaveTextContent(
      '/app/admin/dashboard/percorsi?percorso=p-1&organizzazione=org-1',
    )
  })

  /* A un org admin l'organizzazione non si scrive: la dashboard non gliela
   * lascia scegliere, e nell'indirizzo sarebbe un parametro morto. */
  it('per un org admin porta il solo percorso', async () => {
    renderPage('organization_admin')

    await userEvent.click(
      screen.getByRole('button', { name: 'Mostra chi sta percorrendo Onboarding' }),
    )

    expect(screen.getByTestId('indirizzo')).toHaveTextContent(
      '/app/admin/dashboard/percorsi?percorso=p-1',
    )
    expect(screen.getByTestId('indirizzo')).not.toHaveTextContent('organizzazione')
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

  /* Il super admin che sta guardando una sola organizzazione compone per
   * quella: partendo dalla prima dell'elenco, il percorso appena creato
   * sarebbe nato altrove e sarebbe sparito dalla schermata da cui lo si è
   * composto. */
  it("parte dall'organizzazione che si sta guardando", async () => {
    renderPage('super_admin', null)

    await userEvent.click(screen.getByRole('combobox', { name: 'Organizzazione' }))
    await userEvent.click(screen.getByRole('option', { name: 'Banca Esempio' }))
    await userEvent.click(screen.getByRole('button', { name: /Nuovo Percorso/ }))

    expect(screen.getByText('org: org-1')).toBeInTheDocument()
  })

  /* Senza filtro non c'è nessuna organizzazione da imporre, e a chi ne vede
   * più di una la scelta resta da fare nella tendina del form. */
  it('senza filtro lascia scegliere al form', async () => {
    renderPage('super_admin', null)

    await userEvent.click(screen.getByRole('button', { name: /Nuovo Percorso/ }))

    expect(screen.getByText('org: nessuna')).toBeInTheDocument()
  })

  /* Un org admin non ha filtro da guardare: il tenant è il suo. */
  it('per un org admin parte sempre dal proprio tenant', async () => {
    renderPage('organization_admin')

    await userEvent.click(screen.getByRole('button', { name: /Nuovo Percorso/ }))

    expect(screen.getByText('org: org-1')).toBeInTheDocument()
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

  /* Quel motivo però è di quell'eliminazione: la mutation è una sola per
   * tutta la pagina, e senza azzerarla il rifiuto delle nove restava dentro
   * la conferma aperta alle nove e cinque su un altro percorso, che di suo
   * non aveva ancora fatto niente. */
  it('apre la conferma senza il rifiuto di quella di prima', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina Onboarding' }))

    expect(deletePath.reset).toHaveBeenCalled()
  })
})

describe('caricamento ed errori', () => {
  it('mostra il caricamento dei percorsi', () => {
    stato.paths = { data: [], isPending: true, error: null }
    renderPage()

    expect(screen.getByText('Caricamento percorsi...')).toBeInTheDocument()
  })

  /* Due righe: cosa manca, e cosa lo farebbe comparire. La prima da sola
   * lascia in mezzo a una pagina vuota chi non sa da dove si comincia. */
  it("dice quando non c'è ancora nessun percorso, e come se ne compone uno", () => {
    stato.paths = { data: [], isPending: false, error: null }
    renderPage()

    expect(screen.getByText('Nessun percorso ancora composto')).toBeInTheDocument()
    expect(screen.getByText(/Si compone con «Nuovo Percorso»/)).toBeInTheDocument()
  })

  /* Una lettura caduta non è un elenco senza percorsi: senza il comando per
     riprovare si leggeva «Nessun percorso ancora composto». */
  it('riporta il motivo di un caricamento fallito, e offre di riprovare', async () => {
    ricaricaPercorsi.mockClear()
    stato.paths = { data: [], isPending: false, error: new Error('Sessione scaduta.') }
    renderPage()

    expect(screen.getByText('Sessione scaduta.')).toBeInTheDocument()
    expect(screen.queryByText('Nessun percorso ancora composto')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))
    expect(ricaricaPercorsi).toHaveBeenCalledOnce()
  })

  it("ripiega su un messaggio suo quando l'errore non ne porta uno", () => {
    stato.paths = { data: [], isPending: false, error: 'guasto' }
    renderPage()

    expect(screen.getByText('Impossibile caricare i percorsi.')).toBeInTheDocument()
  })
})
