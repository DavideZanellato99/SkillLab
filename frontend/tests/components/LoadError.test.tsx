import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import LoadError from '../../src/components/LoadError'

/* Un caricamento caduto è l'unico errore a cui si può rimediare restando
 * dove si è: senza il comando, l'unica via è ricaricare la pagina, che
 * dentro una modale vuol dire anche riaprire quello che si stava leggendo. */

describe('quello che non è arrivato', () => {
  it('dice perché e offre di richiederlo', async () => {
    const riprova = vi.fn()
    render(<LoadError message="Sessione scaduta." onRetry={riprova} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Sessione scaduta.')
    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }))

    expect(riprova).toHaveBeenCalledOnce()
  })

  /* Un bottone che non dice niente mentre lavora si preme tre volte. */
  it('mentre riprova lo dice e non si lascia premere', () => {
    const riprova = vi.fn()
    render(<LoadError message="Sessione scaduta." onRetry={riprova} isRetrying />)

    expect(screen.getByRole('button', { name: 'Nuovo tentativo in corso...' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument()
  })
})
