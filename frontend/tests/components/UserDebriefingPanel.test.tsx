import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const servizio = vi.hoisted(() => ({
  fetchUserDebriefing: vi.fn(),
  generateUserDebriefing: vi.fn(),
}))
vi.mock('../../src/services/admin', () => servizio)

import type { UserDebriefing } from '../../src/services/admin'
import UserDebriefingPanel from '../../src/components/UserDebriefingPanel'

/* Il pannello ha una promessa sola, ed è quella su cui insistono i test qui
 * sotto: non mostra mai un giudizio su una persona senza dire, accanto, su
 * cosa poggia e quanto è vecchio. */

const quadro = (over: Partial<UserDebriefing> = {}): UserDebriefing => ({
  user_id: 'u-1',
  summary: 'Sa gestire il tono, chiude prima di aver capito il caso.',
  themes: [
    {
      title: 'Chiude prima di aver capito',
      detail: 'Propone la soluzione dopo due battute.',
      evidence: 'Telefonata con Mario Rossi',
    },
  ],
  improving: 'La presentazione iniziale è migliorata.',
  next_step: 'Un cliente confuso, senza proporre niente per tre turni.',
  covered_conversations: 4,
  covered_attempts: 2,
  covered_until: '2026-03-10T09:00:00',
  conversation_average: 6.5,
  attempt_average: 7.0,
  criteria_averages: [
    { key: 'empatia', label: 'Empatia', average: 8.0 },
    { key: 'identificazione_cliente', label: 'Identificazione', average: 4.5 },
  ],
  is_stale: false,
  created_at: '2026-03-11T09:00:00',
  updated_at: '2026-03-11T09:00:00',
  requested_by: 'formatore@example.com',
  ...over,
})

let client: QueryClient

function renderPanel(evidenceCount = 6) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(
    <UserDebriefingPanel userId="u-1" userName="Anna" evidenceCount={evidenceCount} />,
    { wrapper },
  )
}

beforeEach(() => {
  servizio.fetchUserDebriefing.mockReset().mockResolvedValue(null)
  servizio.generateUserDebriefing.mockReset().mockResolvedValue(quadro())
})

describe('UserDebriefingPanel', () => {
  it('mostra il quadro con su cosa poggia', async () => {
    servizio.fetchUserDebriefing.mockResolvedValue(quadro())

    const { container } = renderPanel()

    expect(await screen.findByText(/Sa gestire il tono/)).toBeInTheDocument()
    expect(screen.getByText('Chiude prima di aver capito')).toBeInTheDocument()
    expect(screen.getByText(/Visto su: Telefonata con Mario Rossi/)).toBeInTheDocument()
    expect(screen.getByText(/Un cliente confuso/)).toBeInTheDocument()
    /* Le prove lette non sono un dettaglio: chi porta questo testo in un
     * colloquio deve poter rispondere a «da dove lo hai preso». La frase è
     * spezzata dai numeri in grassetto, quindi si legge sul testo composto
     * invece che su un nodo solo. */
    expect(container.textContent).toContain('Letto su 4 conversazioni e 2 test tecnici')
  })

  /* Il quadro non si aggiorna da solo, quindi deve dire quando non ha visto
   * le ultime prove: aggiornarsi in silenzio sarebbe una chiamata a pagamento
   * fatta da nessuno, e tacere sarebbe presentarlo come attuale. */
  it('dice quando è invecchiato', async () => {
    servizio.fetchUserDebriefing.mockResolvedValue(quadro({ is_stale: true }))

    renderPanel()

    expect(await screen.findByText('Da aggiornare')).toBeInTheDocument()
  })

  it('non dichiara miglioramenti quando non ce ne sono', async () => {
    servizio.fetchUserDebriefing.mockResolvedValue(quadro({ improving: null }))

    renderPanel()

    await screen.findByText(/Sa gestire il tono/)
    expect(screen.queryByText('Cosa sta migliorando')).not.toBeInTheDocument()
  })

  /* Il criterio più basso è quello che si cerca aprendo questa schermata. */
  it('ordina i criteri dal più basso', async () => {
    servizio.fetchUserDebriefing.mockResolvedValue(quadro())

    renderPanel()

    await screen.findByText(/Sa gestire il tono/)
    const etichette = screen.getAllByText(/Identificazione|Empatia/).map((n) => n.textContent)
    expect(etichette).toEqual(['Identificazione', 'Empatia'])
  })

  it("offre di generarlo quando non c'è ancora", async () => {
    renderPanel()

    const bottone = await screen.findByRole('button', { name: /Genera il quadro/ })
    await userEvent.click(bottone)

    await waitFor(() => expect(servizio.generateUserDebriefing).toHaveBeenCalledWith('u-1'))
  })

  /* Sotto la soglia il bottone non c'è e al suo posto c'è il motivo: un
   * bottone spento senza spiegazione manda a cercare cosa si è sbagliato. */
  it('con troppe poche prove spiega invece di offrire il bottone', async () => {
    renderPanel(2)

    expect(await screen.findByText(/Servono almeno 3 prove/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Genera/ })).not.toBeInTheDocument()
  })
})
