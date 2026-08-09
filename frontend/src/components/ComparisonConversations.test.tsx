import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import ComparisonConversations from './ComparisonConversations'
import type { Attempt } from '../services/comparison'

/* I filtri della metà parlata, cioè la cosa che nessun altro può controllare
 * al posto di questo componente: quali prove restano affiancabili, quale
 * coppia viene proposta fra quelle rimaste, e cosa si legge quando i filtri
 * non ne lasciano abbastanza.
 *
 * Due chiamate con Anna e una chat con Bruno: aperto, il confronto proposto è
 * la prima contro l'ultima, che è proprio il paio che non si legge, e lo dice
 * per due ragioni insieme. È il motivo per cui i filtri esistono. */

function attempt(over: Partial<Attempt> & { conversation_id: string }): Attempt {
  return {
    title: 'Reclamo sul rimborso',
    mode: 'voice',
    avatar_id: 'anna',
    avatar_name: 'Anna Neri',
    conversation_at: '2026-02-01T10:00:00Z',
    evaluated_at: '2026-02-01T11:00:00Z',
    ai_score: 6,
    final_score: 6,
    has_override: false,
    summary: '',
    reviewer_name: null,
    review_note: null,
    review_reason: null,
    criteria: [],
    ...over,
  }
}

const attempts: Attempt[] = [
  attempt({ conversation_id: 'c1', title: 'Prima chiamata', final_score: 5 }),
  attempt({
    conversation_id: 'c2',
    title: 'Seconda chiamata',
    conversation_at: '2026-02-05T10:00:00Z',
    final_score: 8,
  }),
  attempt({
    conversation_id: 'c3',
    title: 'Chat con Bruno',
    mode: 'text',
    avatar_id: 'bruno',
    avatar_name: 'Bruno Verdi',
    conversation_at: '2026-02-09T10:00:00Z',
    final_score: 7,
  }),
]

describe('ComparisonConversations', () => {
  it('avverte quando la coppia proposta mescola scenari e canali', () => {
    render(<ComparisonConversations attempts={attempts} />)

    expect(screen.getByText(/due scenari diversi/)).toBeInTheDocument()
    expect(screen.getByText(/due canali diversi/)).toBeInTheDocument()
  })

  it('restringendo il canale propone una coppia omogenea e non avverte più', async () => {
    const user = userEvent.setup()
    render(<ComparisonConversations attempts={attempts} />)

    await user.click(screen.getByRole('radio', { name: 'Chiamate' }))

    expect(screen.queryByText(/due canali diversi/)).not.toBeInTheDocument()
    expect(screen.queryByText(/due scenari diversi/)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Prima conversazione')).toHaveTextContent('Prima chiamata')
    expect(screen.getByLabelText('Seconda conversazione')).toHaveTextContent('Seconda chiamata')
  })

  it('offre come scenari solo quelli raggiungibili dal canale scelto', async () => {
    const user = userEvent.setup()
    render(<ComparisonConversations attempts={attempts} />)

    await user.click(screen.getByRole('radio', { name: 'Chiamate' }))
    await user.click(screen.getByLabelText('Scenario'))

    const voci = screen.getAllByRole('option').map((o) => o.textContent)
    expect(voci).toEqual(['Tutti gli scenari', 'Anna Neri'])
  })

  it('dice che sono i filtri a lasciare una prova sola, invece del vuoto', async () => {
    const user = userEvent.setup()
    render(<ComparisonConversations attempts={attempts} />)

    await user.click(screen.getByRole('radio', { name: 'Chat' }))

    expect(screen.getByText(/I filtri scelti lasciano una sola conversazione/)).toBeInTheDocument()
    /* La barra resta a schermo: il filtro da allargare è quello che ha appena
       svuotato la pagina, e deve restare a portata di mano. */
    expect(screen.getByRole('radio', { name: 'Chiamate' })).toBeInTheDocument()
  })
})
