import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il form in cui un percorso prende la sua forma: titolo, organizzazione e la
 * fila di tappe da superare in ordine.
 *
 * Le regole che qui si tengono ferme sono tre, e nessuna si vede guardando il
 * markup. La prima è **cosa impedisce di salvare**: il bottone resta acceso e
 * a fermare è un messaggio che nomina la tappa e cosa le manca, perché un
 * bottone spento in fondo a sei tappe uguali non dice quale correggere. La
 * seconda è **come una proposta entra nel form**: scrive nei campi vuoti e in
 * quelli che aveva scritto lei, mai in quelli scritti a mano, e le tappe le
 * sostituisce tutte. La terza è **il tenant**: cambiandolo cambia il catalogo,
 * quindi le tappe scelte prima non ci sono più dentro. */

const contenuto = vi.hoisted(() => ({
  data: {
    avatars: [
      { id: 'a1', name: 'Mario Rossi', category: 'Clienti', category_color: 'violet' },
      { id: 'a2', name: 'Anna Verdi', category: 'Clienti', category_color: 'violet' },
    ],
    simulations: [{ id: 'x1', title: 'Procedure di cassa', kind: 'multiple' }],
    criteria: [{ key: 'empatia', label: 'Empatia', weight: 15 }],
  },
  isPending: false,
}))
const create = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as unknown,
}))
const update = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null as unknown,
}))
vi.mock('../../src/hooks/useTraining', () => ({
  useAssignableContent: () => contenuto,
  useCreatePath: () => create,
  useUpdatePath: () => update,
}))

/* La finestra della proposta ha il suo test: qui basta che consegni qualcosa,
 * perché quello che si prova è come il form la fa entrare. */
vi.mock('../../src/components/PathDraftModal', () => ({
  default: ({ onDrafted, onClose }: { onDrafted: (d: unknown) => void; onClose: () => void }) => (
    <button
      onClick={() => {
        onDrafted({
          title: 'Onboarding proposto',
          description: 'Proposta del modello.',
          steps: [
            { avatar_id: 'a2', simulation_id: null, target_score: 6, reason: 'Si parte facile.' },
          ],
        })
        onClose()
      }}
    >
      consegna la proposta
    </button>
  ),
}))

import type { TrainingPath } from '../../src/services/training'
import TrainingPathEditorModal from '../../src/components/TrainingPathEditorModal'

const organizzazioni = [
  { id: 'org-1', name: 'Banca Esempio' },
  { id: 'org-2', name: 'Assicura SpA' },
]

const percorso = (over: Partial<TrainingPath> = {}): TrainingPath => ({
  id: 'p-1',
  organization_id: 'org-1',
  organization_name: 'Banca Esempio',
  title: 'Onboarding',
  description: 'Per chi comincia.',
  steps: [
    {
      id: 's-1',
      position: 1,
      kind: 'avatar',
      target_score: 7,
      criteria_targets: [],
      due_at: null,
      avatar_id: 'a1',
      avatar_name: 'Mario Rossi',
      avatar_category: 'Clienti',
      avatar_category_color: 'violet',
      simulation_id: null,
      simulation_title: null,
      simulation_kind: null,
    },
  ],
  assigned_count: 0,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  ...over,
})

function apri(path: TrainingPath | null = null) {
  const onClose = vi.fn()
  render(
    <TrainingPathEditorModal
      path={path}
      organizations={organizzazioni}
      defaultOrganizationId={null}
      onClose={onClose}
    />,
  )
  return onClose
}

const titolo = () => screen.getByLabelText('Titolo')

/** Sceglie il bersaglio della prima tappa che sta ancora aspettando una scelta. */
async function scegliAvatar(nome: string) {
  await userEvent.click(screen.getAllByPlaceholderText('Cerca un avatar...')[0])
  await userEvent.click(screen.getByRole('option', { name: new RegExp(nome) }))
}

beforeEach(() => {
  vi.clearAllMocks()
  create.isPending = false
  create.error = null
  update.isPending = false
  update.error = null
  contenuto.isPending = false
})

describe('comporre un percorso nuovo', () => {
  it('manda titolo, organizzazione e tappe', async () => {
    apri()

    await userEvent.type(titolo(), 'Onboarding vendite')
    await scegliAvatar('Mario Rossi')
    await userEvent.click(screen.getByRole('button', { name: /Crea il percorso/ }))

    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({
        title: 'Onboarding vendite',
        description: null,
        organization_id: 'org-1',
        steps: [
          {
            avatar_id: 'a1',
            simulation_id: null,
            target_score: 7,
            criteria_targets: {},
            due_at: null,
          },
        ],
      }),
    )
  })

  it('si chiude solo dopo che il salvataggio è andato a buon fine', async () => {
    create.mutateAsync.mockRejectedValueOnce(new Error('Avatar archiviato.'))
    create.error = new Error('Avatar archiviato.')
    const onClose = apri()

    await userEvent.type(titolo(), 'Onboarding vendite')
    await scegliAvatar('Mario Rossi')
    await userEvent.click(screen.getByRole('button', { name: /Crea il percorso/ }))

    expect(await screen.findByText('Avatar archiviato.')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

/* Il bottone resta acceso anche su un percorso incompleto, e a fermare è il
 * messaggio: spento non diceva niente, e la cosa da correggere stava in mezzo
 * a una fila di tappe che si somigliano. */
describe('cosa impedisce di salvare', () => {
  it('nomina la tappa a cui manca il bersaglio', async () => {
    apri()

    await userEvent.type(titolo(), 'Onboarding vendite')
    await scegliAvatar('Mario Rossi')
    await userEvent.click(screen.getByRole('button', { name: /Aggiungi Tappa/ }))
    await userEvent.click(screen.getByRole('button', { name: /Crea il percorso/ }))

    expect(screen.getByText('Tappa 2: scegli l’avatar con cui si parla.')).toBeInTheDocument()
    expect(create.mutateAsync).not.toHaveBeenCalled()
  })

  it('nomina la tappa a cui è stato svuotato l’obiettivo', async () => {
    apri()

    await userEvent.type(titolo(), 'Onboarding vendite')
    await scegliAvatar('Mario Rossi')
    fireEvent.change(screen.getByLabelText('Obiettivo (1-10)'), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: /Crea il percorso/ }))

    expect(screen.getByText('Tappa 1: scrivi l’obiettivo, un voto fra 1 e 10.')).toBeInTheDocument()
    expect(create.mutateAsync).not.toHaveBeenCalled()
  })

  it('chiede prima di tutto un titolo', async () => {
    apri()

    await scegliAvatar('Mario Rossi')
    await userEvent.click(screen.getByRole('button', { name: /Crea il percorso/ }))

    expect(screen.getByText('Serve un titolo e un’organizzazione.')).toBeInTheDocument()
    expect(create.mutateAsync).not.toHaveBeenCalled()
  })
})

describe('modificare un percorso che esiste', () => {
  it('riapre le tappe com’erano e manda la riscrittura', async () => {
    apri(percorso())

    expect(titolo()).toHaveValue('Onboarding')
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Salva il percorso/ }))

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ pathId: 'p-1' })),
    )
  })

  /* Le tappe puntano a roba del tenant: spostare il percorso altrove le
   * lascerebbe a puntare fuori. */
  it('non lascia cambiare organizzazione', () => {
    apri(percorso())

    expect(screen.getByRole('combobox', { name: /Organizzazione/ })).toBeDisabled()
    expect(screen.getByText(/Non è modificabile/)).toBeInTheDocument()
  })

  /* Modificare vale subito per chi lo sta percorrendo, ed è il genere di cosa
   * da sapere prima di premere. */
  it('avverte quando qualcuno lo sta già percorrendo', () => {
    apri(percorso({ assigned_count: 4 }))

    expect(screen.getByText(/valgono subito per le 4 persone/)).toBeInTheDocument()
  })

  /* Rigenerare le tappe di un percorso in corso non sarebbe una bozza:
   * sarebbe buttare il lavoro di qualcuno insieme al suo progresso. */
  it('non offre la proposta del modello', () => {
    apri(percorso())

    expect(screen.queryByRole('button', { name: /Proponi un percorso/ })).not.toBeInTheDocument()
  })
})

describe('la proposta che entra nel form', () => {
  const consegna = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Proponi un percorso/ }))
    await userEvent.click(screen.getByRole('button', { name: 'consegna la proposta' }))
  }

  it('riempie i campi vuoti e mette in fila le tappe proposte', async () => {
    apri()

    await consegna()

    expect(titolo()).toHaveValue('Onboarding proposto')
    expect(screen.getByLabelText('Descrizione')).toHaveValue('Proposta del modello.')
    expect(screen.getByText('Anna Verdi')).toBeInTheDocument()
    // La motivazione viaggia con la tappa, e si legge mentre si decide se tenerla
    expect(screen.getByText('Si parte facile.')).toBeInTheDocument()
  })

  it('non tocca il titolo scritto a mano', async () => {
    apri()

    await userEvent.type(titolo(), 'Il mio titolo')
    await consegna()

    expect(titolo()).toHaveValue('Il mio titolo')
    /* Le tappe però le sostituisce tutte: sono una fila ordinata, e infilarci
       dentro una proposta darebbe un percorso che non ha composto né il
       modello né la persona. */
    expect(screen.getByText('Anna Verdi')).toBeInTheDocument()
  })
})

/* Cambiando tenant cambia il catalogo, e le tappe scelte prima non ci sono
 * più dentro: tenerle sarebbe un percorso che il server rifiuta. */
describe('il tenant del percorso', () => {
  it('azzera le tappe quando si cambia organizzazione', async () => {
    apri()

    await scegliAvatar('Mario Rossi')
    expect(screen.getByText('Mario Rossi')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: /Organizzazione/ }))
    await userEvent.click(screen.getByRole('option', { name: 'Assicura SpA' }))

    expect(screen.queryByText('Mario Rossi')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Cerca un avatar...')).toBeInTheDocument()
  })

  it('aspetta il catalogo prima di far comporre le tappe', () => {
    contenuto.isPending = true
    apri()

    expect(screen.getByText('Caricamento del catalogo...')).toBeInTheDocument()
  })
})
