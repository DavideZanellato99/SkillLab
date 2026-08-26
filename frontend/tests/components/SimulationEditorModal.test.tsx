import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Il pannello in cui una simulazione diventa un test. Qui si difendono le due
 * cose che nessun altro difende: quello che si sta scrivendo non sparisce da
 * sotto le mani, e i dati del test si correggono senza uscire di qui. */

const stato = vi.hoisted(() => ({
  dettaglio: { data: undefined as unknown, isLoading: false },
  risultati: { data: [] as unknown[] },
}))

const mutazioni = vi.hoisted(() => {
  const nuova = () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null as Error | null,
  })
  return {
    genera: nuova(),
    controlla: nuova(),
    salva: nuova(),
    stato: nuova(),
    dati: nuova(),
    documento: nuova(),
  }
})

vi.mock('../../src/hooks/useSimulations', () => ({
  useAdminSimulation: () => stato.dettaglio,
  useGenerateQuestions: () => mutazioni.genera,
  useReviewPool: () => mutazioni.controlla,
  useSaveQuestions: () => mutazioni.salva,
  useUpdateSimulationStatus: () => mutazioni.stato,
  useUpdateSimulation: () => mutazioni.dati,
  useReplaceSimulationDocument: () => mutazioni.documento,
  useSimulationResults: () => stato.risultati,
  /* Lo usa la finestra di un tentativo, che da qui si apre sul caricamento:
     quello che conta è che si apra, le risposte hanno i test loro. */
  useAttempt: () => ({ data: undefined, isLoading: true, error: null, refetch: vi.fn() }),
}))

import type { SimulationAdminDetail, SimulationQuestionAdmin } from '../../src/services/simulations'
import SimulationEditorModal from '../../src/components/SimulationEditorModal'

const domanda = (over: Partial<SimulationQuestionAdmin> = {}): SimulationQuestionAdmin =>
  ({
    id: 'q-1',
    position: 1,
    text: 'Quando si sblocca una carta?',
    options: ['Subito', "Dopo l'identificazione"],
    steps: [],
    left: [],
    right: [],
    correct_option: 1,
    expected_answer: '',
    ordered_steps: null,
    pairs: null,
    explanation: 'La procedura chiede prima di identificare il cliente.',
    source_chunks: null,
    ...over,
  }) as SimulationQuestionAdmin

const dettaglio = (over: Partial<SimulationAdminDetail> = {}): SimulationAdminDetail =>
  ({
    id: 's-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    title: 'Normativa antiriciclaggio',
    description: 'Le verifiche di primo livello',
    status: 'draft',
    kind: 'multiple',
    source: 'manual',
    document_name: '',
    question_count: 1,
    created_at: '2026-03-01T09:00:00',
    updated_at: '2026-03-01T09:00:00',
    last_attempt_at: null,
    last_attempt_score: null,
    attempt_count: 0,
    created_by_email: 'admin@esempio.it',
    updated_by_email: null,
    questions: [domanda()],
    chunk_count: 0,
    total_attempts: 0,
    review: null,
    ...over,
  }) as SimulationAdminDetail

function apri(detail: SimulationAdminDetail = dettaglio(), onClose = vi.fn()) {
  stato.dettaglio = { data: detail, isLoading: false }
  const view = render(<SimulationEditorModal simulationId="s-1" onClose={onClose} />)
  /** Una lettura nuova dal server, come quella che parte al ritorno sulla finestra. */
  const rilegge = (next: SimulationAdminDetail) => {
    stato.dettaglio = { data: next, isLoading: false }
    view.rerender(<SimulationEditorModal simulationId="s-1" onClose={onClose} />)
  }
  return { rilegge, onClose }
}

describe('SimulationEditorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /* Il caso che costa di più a chi prepara i test: si scrivono le domande, si
     passa al documento aperto in un'altra finestra, si torna, e la query si
     ricontrolla da sola. Quello che il server rimanda è identico, e non deve
     prendere il posto di quello che è stato scritto nel frattempo. */
  it('tiene quello che si sta scrivendo quando il server rimanda le stesse domande', async () => {
    const { rilegge } = apri()

    const campo = screen.getByLabelText('Testo della domanda 1')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Quando si sblocca una carta bloccata?')

    rilegge(dettaglio())

    expect(screen.getByLabelText('Testo della domanda 1')).toHaveValue(
      'Quando si sblocca una carta bloccata?',
    )
  })

  /* Dopo una generazione le domande sono altre: tenere quelle di prima
     vorrebbe dire mostrare un test che non esiste più. */
  it('si riallinea quando il serbatoio del server è cambiato davvero', async () => {
    const { rilegge } = apri()

    const campo = screen.getByLabelText('Testo della domanda 1')
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Una correzione mai salvata')

    rilegge(dettaglio({ questions: [domanda({ text: 'Le domande generate adesso' })] }))

    expect(screen.getByLabelText('Testo della domanda 1')).toHaveValue('Le domande generate adesso')
  })

  it('apre i dati del test accanto alle domande', async () => {
    apri()

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))

    expect(screen.getByLabelText('Titolo')).toHaveValue('Normativa antiriciclaggio')
    expect(screen.getByLabelText('Descrizione')).toHaveValue('Le verifiche di primo livello')
  })

  it('salva i dati del test con quello che è stato scritto', async () => {
    apri()

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))
    await userEvent.type(screen.getByLabelText('Titolo'), ' 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Salva i dati' }))

    expect(mutazioni.dati.mutate).toHaveBeenCalledWith({
      title: 'Normativa antiriciclaggio 2026',
      description: 'Le verifiche di primo livello',
    })
  })

  /* Il titolo corretto e non ancora salvato non deve tornare com'era solo
     perché si è andati a rileggere una domanda. */
  it('tiene il titolo in scrittura cambiando linguetta', async () => {
    apri()

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))
    await userEvent.type(screen.getByLabelText('Titolo'), ' 2026')
    await userEvent.click(screen.getByRole('tab', { name: /Domande/ }))
    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))

    expect(screen.getByLabelText('Titolo')).toHaveValue('Normativa antiriciclaggio 2026')
  })

  /* Su un test scritto a mano il documento non c'è, e la generazione nemmeno:
     il posto in cui l'elenco cresce è l'elenco stesso. */
  it('non offre il documento su un test scritto a mano', async () => {
    apri()

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))

    expect(screen.queryByRole('button', { name: 'Sostituisci il documento' })).toBeNull()
  })

  it('offre la sostituzione del documento su un test generato', async () => {
    apri(dettaglio({ source: 'ai', document_name: 'procedura-v2.pdf', chunk_count: 12 }))

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))

    expect(screen.getByRole('button', { name: 'Sostituisci il documento' })).toBeInTheDocument()
    /* Due volte: in cima al pannello, dove sta da sempre, e accanto al
       bottone che lo sostituisce. */
    expect(screen.getAllByText('12 passaggi indicizzati')).toHaveLength(2)
  })

  // ── La chiusura ─────────────────────────────────────────────────────

  it('si chiude senza domande quando non c’è niente di non salvato', async () => {
    const { onClose } = apri()

    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('Modifiche non salvate')).toBeNull()
  })

  /* Il gesto che costava di più: un Esc o una X su cinquanta domande scritte
     e mai salvate le portava via senza dire niente. */
  it('chiede conferma prima di buttare le domande scritte', async () => {
    const { onClose } = apri()

    await userEvent.type(screen.getByLabelText('Testo della domanda 1'), ' davvero')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Modifiche non salvate')).toBeInTheDocument()
    expect(screen.getByText(/domande scritte dopo/i)).toBeInTheDocument()
  })

  it('torna alle domande se si sceglie di continuare', async () => {
    const { onClose } = apri()

    await userEvent.type(screen.getByLabelText('Testo della domanda 1'), ' davvero')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Continua a modificare' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Testo della domanda 1')).toHaveValue(
      'Quando si sblocca una carta? davvero',
    )
  })

  it('chiude comunque quando lo si conferma', async () => {
    const { onClose } = apri()

    await userEvent.type(screen.getByLabelText('Testo della domanda 1'), ' davvero')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    await userEvent.click(screen.getByRole('button', { name: 'Esci senza salvare' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('chiede conferma anche per un titolo corretto e non salvato', async () => {
    const { onClose } = apri()

    await userEvent.click(screen.getByRole('tab', { name: 'Dati del test' }))
    await userEvent.type(screen.getByLabelText('Titolo'), ' 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/titolo e la descrizione non ancora salvati/i)).toBeInTheDocument()
  })

  /* Una riga aperta e mai riempita non è una domanda: chiedere conferma per
     quella insegna a rispondere senza leggere. */
  it('non chiede niente per una riga aggiunta e lasciata vuota', async () => {
    const { onClose } = apri()

    await userEvent.click(screen.getByRole('button', { name: /Aggiungi Domanda/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(onClose).toHaveBeenCalled()
  })

  // ── I conteggi e i risultati ────────────────────────────────────────

  it('conta nella linguetta solo le domande scritte', async () => {
    apri()

    expect(screen.getByRole('tab', { name: 'Domande (1)' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Aggiungi Domanda/i }))

    expect(screen.getByRole('tab', { name: 'Domande (1)' })).toBeInTheDocument()
    expect(screen.getByText(/1 domanda inserita/)).toBeInTheDocument()
  })

  /* Svuotare un serbatoio scritto a mano per rifarlo da capo è un gesto
     legittimo, e prima il salvataggio si spegneva proprio lì. */
  it('lascia salvare anche quando le domande sono state tolte tutte', async () => {
    apri()

    await userEvent.click(screen.getByRole('button', { name: 'Elimina la domanda 1' }))

    expect(screen.getByRole('button', { name: 'Salva domande' })).toBeEnabled()
  })

  it('apre il tentativo di una persona dai risultati', async () => {
    stato.risultati = {
      data: [
        {
          id: 't-1',
          user_name: 'Giulia Bianchi',
          user_email: 'giulia@esempio.it',
          correct_count: 8,
          question_count: 10,
          score: 8,
          created_at: '2026-03-10T09:00:00',
        },
      ],
    }
    apri(dettaglio({ total_attempts: 1 }))

    await userEvent.click(screen.getByRole('tab', { name: 'Risultati (1)' }))
    await userEvent.click(screen.getByRole('button', { name: /Rileggi il test di Giulia Bianchi/ }))

    expect(screen.getByLabelText('Chiudi dettaglio tentativo')).toBeInTheDocument()
    stato.risultati = { data: [] }
  })
})
