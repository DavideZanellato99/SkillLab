import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ConversationReview } from '../services/api'
import TrainerReviewNote from './TrainerReviewNote'

const revisione = (over: Partial<ConversationReview> = {}): ConversationReview => ({
  conversation_id: 'c-1',
  reviewer_name: 'Anna Rossi',
  summary_note: 'Buon controllo del tono, chiudi prima la trattativa.',
  override_score: null,
  override_reason: null,
  ai_score_at_review: 7,
  is_stale: false,
  annotations: [],
  created_at: '2026-03-01T10:00:00Z',
  updated_at: '2026-03-02T10:00:00Z',
  ...over,
})

describe('TrainerReviewNote', () => {
  it('mostra la nota firmata e datata', () => {
    render(<TrainerReviewNote review={revisione()} />)

    expect(screen.getByText(/Buon controllo del tono/)).toBeInTheDocument()
    expect(screen.getByText('Anna Rossi')).toBeInTheDocument()
    expect(screen.getByText('02 mar 2026')).toBeInTheDocument()
  })

  it('mostra il motivo di un voto corretto', () => {
    render(
      <TrainerReviewNote
        review={revisione({ override_score: 8, override_reason: 'Contesto difficile.' })}
      />,
    )

    expect(screen.getByText(/Motivo della correzione/)).toBeInTheDocument()
    expect(screen.getByText(/Contesto difficile\./)).toBeInTheDocument()
  })

  /* Il numero corretto non si ripete qui: lo dice già il punteggio grande
   * sopra, e scriverlo due volte a mezzo schermo di distanza fa dubitare
   * quale dei due sia il voto. */
  it('non ripete il voto corretto', () => {
    render(<TrainerReviewNote review={revisione({ override_score: 8 })} />)

    expect(screen.queryByText(/8\/10/)).not.toBeInTheDocument()
  })

  /* Una revisione fatta di sole annotazioni sui messaggi non ha niente da
   * dire qui: quelle vivono attaccate alla riga di cui parlano, e un
   * riquadro con la sola intestazione sembrerebbe una nota andata persa. */
  it("sparisce quando non c'è niente da leggere", () => {
    const { container } = render(
      <TrainerReviewNote review={revisione({ summary_note: null, override_reason: null })} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  /* La valutazione automatica è stata rigenerata dopo la revisione: il voto
   * di cui il docente parlava non è più quello a schermo, e dirlo è più
   * onesto che far passare la correzione per attuale. */
  it('avverte quando il docente commentava un altro punteggio', () => {
    render(<TrainerReviewNote review={revisione({ is_stale: true })} />)

    expect(screen.getByText(/rigenerata dopo questa revisione/)).toBeInTheDocument()
  })

  it('non avverte niente su una revisione ancora valida', () => {
    render(<TrainerReviewNote review={revisione()} />)

    expect(screen.queryByText(/rigenerata dopo questa revisione/)).not.toBeInTheDocument()
  })
})
