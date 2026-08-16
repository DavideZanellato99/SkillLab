import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SimulationReview } from '../../src/services/simulations'
import SimulationReviewPanel from '../../src/components/SimulationReviewPanel'

/* Il pannello ha una promessa sola, e i test la difendono: dice da quale
 * domanda cominciare, e non impedisce niente. */

const review = (over: Partial<SimulationReview> = {}): SimulationReview => ({
  findings: [
    {
      kind: 'unsupported',
      severity: 'high',
      positions: [12],
      message: 'Il documento non indica nessun termine di trenta giorni.',
    },
    {
      kind: 'duplicate',
      severity: 'medium',
      positions: [4, 31],
      message: 'Le domande 4 e 31 chiedono quasi la stessa cosa.',
    },
  ],
  checked: 48,
  reviewed_at: '2026-03-11T09:00:00',
  is_stale: false,
  ...over,
})

function renderPanel(over: Partial<SimulationReview> | null = {}, props = {}) {
  const onRun = vi.fn()
  const onGoTo = vi.fn()
  render(
    <SimulationReviewPanel
      review={over === null ? null : review(over)}
      isPending={false}
      error=""
      onRun={onRun}
      onGoTo={onGoTo}
      {...props}
    />,
  )
  return { onRun, onGoTo }
}

describe('SimulationReviewPanel', () => {
  it('elenca le segnalazioni con quello che non torna', () => {
    renderPanel()

    expect(screen.getByText(/nessun termine di trenta giorni/)).toBeInTheDocument()
    expect(screen.getByText(/chiedono quasi la stessa cosa/)).toBeInTheDocument()
    expect(screen.getByText(/su 48 domande verificabili/)).toBeInTheDocument()
  })

  /* Il pannello sta in cima a un elenco lungo cinquanta schede: senza il
   * salto, "la domanda 12" sarebbe un numero da cercare a mano. */
  it('porta alla domanda di cui parla', async () => {
    const { onGoTo } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Vai alla domanda 12' }))

    expect(onGoTo).toHaveBeenCalledWith(12)
  })

  it('su un duplicato porta a entrambe le domande della coppia', async () => {
    const { onGoTo } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: '31' }))

    expect(onGoTo).toHaveBeenCalledWith(31)
  })

  /* Senza questo, chi ha appena premuto non sa se il controllo è passato o
   * se non è partito. */
  it('dice quando non ha trovato niente', () => {
    renderPanel({ findings: [] })

    expect(screen.getByText(/Nessun rilievo/)).toBeInTheDocument()
  })

  it('non è mai stato chiesto: spiega cosa farebbe', () => {
    renderPanel(null)

    expect(screen.getByText(/Cerca le domande ripetute/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Controlla le domande/ })).toBeInTheDocument()
  })

  it('dice quando le domande sono cambiate dopo il controllo', () => {
    renderPanel({ is_stale: true })

    expect(screen.getByText('Da ripetere')).toBeInTheDocument()
  })

  it('lancia il controllo', async () => {
    const { onRun } = renderPanel(null)

    await userEvent.click(screen.getByRole('button', { name: /Controlla le domande/ }))

    expect(onRun).toHaveBeenCalled()
  })

  it("mostra l'errore del server", () => {
    renderPanel(null, { error: 'Il fornitore non ha risposto.' })

    expect(screen.getByText('Il fornitore non ha risposto.')).toBeInTheDocument()
  })
})
