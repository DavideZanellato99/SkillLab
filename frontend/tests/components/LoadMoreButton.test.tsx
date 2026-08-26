import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import LoadMoreButton from '../../src/components/LoadMoreButton'

/* Il pulsante in fondo agli elenchi che dal server arrivano a finestre. Era
 * ricopiato fra la gestione utenti e il registro attività, con lo spinner e
 * la parola "Caricamento..." ogni volta riscritti: qui c'è una volta sola
 * anche il comportamento, cioè che mentre la finestra arriva si spegne. */

describe('LoadMoreButton', () => {
  it('chiede la finestra successiva', async () => {
    const onClick = vi.fn()
    render(
      <LoadMoreButton onClick={onClick} isLoading={false}>
        Carica altre 200
      </LoadMoreButton>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Carica altre 200' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  /* Spento e non solo attenuato: due clic di seguito chiederebbero due volte
   * la stessa finestra, e la seconda arriverebbe a righe già a schermo. */
  it('si spegne e lo dice mentre la finestra arriva', async () => {
    const onClick = vi.fn()
    render(
      <LoadMoreButton onClick={onClick} isLoading>
        Carica altre 200
      </LoadMoreButton>,
    )

    const bottone = screen.getByRole('button', { name: /Caricamento/ })
    expect(bottone).toBeDisabled()
    expect(screen.queryByText('Carica altre 200')).not.toBeInTheDocument()

    await userEvent.click(bottone)
    expect(onClick).not.toHaveBeenCalled()
  })
})
