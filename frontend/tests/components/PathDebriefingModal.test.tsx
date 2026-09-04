import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchPathDebriefings: vi.fn(),
  generatePathDebriefing: vi.fn(),
}))
vi.mock('../../src/services/training', () => servizio)

import type { PathDebriefing, TrainingPath } from '../../src/services/training'
import PathDebriefingModal from '../../src/components/PathDebriefingModal'

/* La finestra ha due promesse, e sono quelle su cui insistono i test qui
 * sotto: dice sempre su quante persone e quante prove poggia quello che si
 * sta leggendo, e non lascia mai credere che un quadro scritto prima che le
 * tappe cambiassero sia quello di adesso. */

const percorso = (over: Partial<TrainingPath> = {}): TrainingPath =>
  ({
    id: 'p-1',
    organization_id: 'org-1',
    organization_name: 'Banca Esempio',
    title: 'Onboarding',
    description: null,
    steps: [],
    assigned_count: 6,
    created_at: '2026-01-01T10:00:00',
    updated_at: '2026-01-01T10:00:00',
    ...over,
  }) as TrainingPath

const quadro = (over: Partial<PathDebriefing> = {}): PathDebriefing => ({
  id: 'q-2',
  path_id: 'p-1',
  summary: 'Il gruppo regge il tono ma non identifica il cliente.',
  blocker_position: 2,
  blocker: "Ci si ferma qui perché l'identificazione non arriva alla soglia.",
  themes: [
    {
      title: 'Il codice cliente non lo chiede nessuno',
      detail: 'Le prove partono dal problema senza identificare chi chiama.',
      evidence: 'tappa 1 e tappa 2',
    },
  ],
  strength: 'Il tono resta professionale anche quando il cliente insiste.',
  next_step: "Un giro d'aula sull'apertura, con l'identificazione come unico obiettivo.",
  direction: null,
  change: null,
  group_changed: false,
  covered_people: 6,
  covered_conversations: 14,
  covered_attempts: 2,
  covered_until: '2026-03-10T09:00:00',
  conversation_average: 6.2,
  attempt_average: 7.0,
  criteria_averages: [
    { key: 'empatia', label: 'Empatia', average: 8.0, delta: null },
    { key: 'identificazione_cliente', label: 'Identificazione', average: 4.5, delta: null },
  ],
  started: 5,
  completed: 1,
  overdue: 2,
  steps: [
    {
      position: 1,
      kind: 'avatar',
      label: 'Cliente Uno',
      target_score: 7,
      unlocked: 6,
      passed: 5,
      stuck: 1,
      proofs: 9,
      best_average: 7.4,
    },
    {
      position: 2,
      kind: 'avatar',
      label: 'Cliente Due',
      target_score: 7,
      unlocked: 5,
      passed: 1,
      stuck: 4,
      proofs: 7,
      best_average: 6.1,
    },
  ],
  conversation_average_delta: null,
  attempt_average_delta: null,
  stale_reason: null,
  created_at: '2026-03-11T09:00:00',
  requested_by: 'formatore@example.com',
  ...over,
})

/* Uno storico vero: il vecchio sotto, il nuovo sopra con la direzione e lo
 * scarto della media, cioè le due cose che esistono solo dal secondo in poi e
 * solo se il gruppo è rimasto lo stesso. */
const precedente = quadro({
  id: 'q-1',
  summary: 'Il primo quadro, di gennaio.',
  created_at: '2026-01-10T09:00:00',
  conversation_average: 5.2,
})
const recente = quadro({
  direction: 'up',
  change: 'La tappa 1 non ferma più nessuno.',
  conversation_average_delta: 1.0,
})

function renderModal(path: TrainingPath = percorso()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PathDebriefingModal path={path} onClose={vi.fn()} />, { wrapper })
}

beforeEach(() => {
  servizio.fetchPathDebriefings.mockReset().mockResolvedValue([])
  servizio.generatePathDebriefing.mockReset().mockResolvedValue(quadro())
})

describe('PathDebriefingModal', () => {
  it('mostra il quadro con su cosa poggia', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro()])

    renderModal()

    expect(await screen.findByText(/Il gruppo regge il tono/)).toBeInTheDocument()
    expect(screen.getByText('Il codice cliente non lo chiede nessuno')).toBeInTheDocument()
    expect(screen.getByText(/Visto su: tappa 1 e tappa 2/)).toBeInTheDocument()
    /* La frase è spezzata dai numeri in grassetto, quindi si legge sul testo
     * composto invece che su un nodo solo. Dal `body` e non dal contenitore
     * del render: il pannello di una modale esce da un portal. */
    expect(document.body.textContent).toContain(
      'Letto su 6 persone, 14 conversazioni e 2 test tecnici',
    )
  })

  /* Dove il percorso si inceppa è la domanda con cui si apre questa finestra,
   * e la tappa la sceglie il conteggio: il modello ne spiega solo il perché. */
  it('dice dove il gruppo si ferma', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro()])

    renderModal()

    expect(await screen.findByText('Il gruppo si ferma alla tappa 2')).toBeInTheDocument()
    expect(screen.getByText('4 ferme')).toBeInTheDocument()
  })

  it('non dichiara nessun blocco quando non è ferma nessuna persona', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([
      quadro({ blocker_position: null, blocker: null }),
    ])

    renderModal()

    await screen.findByText(/Il gruppo regge il tono/)
    expect(screen.queryByText(/Il gruppo si ferma/)).not.toBeInTheDocument()
  })

  /* Il quadro non si aggiorna da solo, e qui i modi di invecchiare sono due:
   * prove nuove, e tappe riscritte. Il secondo è il più insidioso, perché il
   * testo parla di una fila che non esiste più. */
  it('dice quando le tappe sono cambiate sotto', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro({ stale_reason: 'percorso' })])

    renderModal()

    expect(await screen.findByText('Da aggiornare')).toBeInTheDocument()
  })

  it('non offre di rigenerarlo quando non è cambiato niente', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro()])

    renderModal()

    await screen.findByText(/Il gruppo regge il tono/)
    expect(screen.getByRole('button', { name: /Genera un quadro aggiornato/ })).toBeDisabled()
  })

  it("offre di generarlo quando non c'è ancora", async () => {
    renderModal()

    const bottone = await screen.findByRole('button', { name: /Genera il quadro/ })
    await userEvent.click(bottone)

    await waitFor(() => expect(servizio.generatePathDebriefing).toHaveBeenCalledWith('p-1'))
  })

  /* Sotto la soglia il bottone non c'è e al suo posto c'è il motivo: un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  it('con troppe poche persone spiega invece di offrire il bottone', async () => {
    renderModal(percorso({ assigned_count: 2 }))

    expect(await screen.findByText(/Servono almeno 3 persone/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Genera/ })).not.toBeInTheDocument()
  })

  /* La domanda che si fa chi apre questa finestra su un percorso che segue
   * già non è "com'è messo", è "come si sta muovendo". */
  it('dice come si è mosso il gruppo dal quadro precedente', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([recente, precedente])

    renderModal()

    /* Due volte, ed è voluto: l'etichetta sta sul quadro aperto e sulla riga
     * dello storico, che è dove si verifica rispetto a cosa. */
    expect(await screen.findAllByText('In miglioramento')).toHaveLength(2)
    expect(screen.getByText('La tappa 1 non ferma più nessuno.')).toBeInTheDocument()
  })

  /* Che il confronto non si possa fare è una notizia: tacere lascerebbe
   * credere che il modello non abbia voluto sbilanciarsi. */
  it('quando il gruppo è cambiato dice che non si confronta niente', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro({ group_changed: true }), precedente])

    renderModal()

    expect(await screen.findByText('Nessun confronto con il quadro precedente')).toBeInTheDocument()
    expect(screen.queryByText('In miglioramento')).not.toBeInTheDocument()
  })

  /* Una versione vecchia riaperta lo dice in chiaro: leggere per attuale un
   * testo scritto due mesi fa è l'unico modo in cui questa finestra inganna. */
  it('lo storico si sfoglia, e una versione vecchia lo dichiara', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([recente, precedente])

    renderModal()

    await screen.findByText(/Il gruppo regge il tono/)
    await userEvent.click(screen.getByRole('button', { name: /gen 2026/ }))

    expect(await screen.findByText(/Il primo quadro, di gennaio/)).toBeInTheDocument()
    expect(screen.getByText(/Stai leggendo un quadro precedente/)).toBeInTheDocument()
  })

  it('non dichiara punti di forza quando non ce ne sono', async () => {
    servizio.fetchPathDebriefings.mockResolvedValue([quadro({ strength: null })])

    renderModal()

    await screen.findByText(/Il gruppo regge il tono/)
    expect(screen.queryByText('Cosa Il Gruppo Fa Bene')).not.toBeInTheDocument()
  })
})
