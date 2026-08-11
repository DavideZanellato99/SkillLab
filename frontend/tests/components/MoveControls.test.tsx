import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import MoveControls from '../../src/components/MoveControls'

function renderControls(over: Partial<Parameters<typeof MoveControls>[0]> = {}) {
  const onUp = vi.fn()
  const onDown = vi.fn()
  render(
    <MoveControls
      label="Primo passo"
      onUp={onUp}
      onDown={onDown}
      canMoveUp
      canMoveDown
      {...over}
    />,
  )
  return { onUp, onDown }
}

const su = () => screen.getByRole('button', { name: 'Sposta in alto: Primo passo' })
const giu = () => screen.getByRole('button', { name: 'Sposta in basso: Primo passo' })

describe('MoveControls', () => {
  it('sposta di un posto nella direzione scelta', async () => {
    const { onUp, onDown } = renderControls()

    await userEvent.click(su())
    await userEvent.click(giu())

    expect(onUp).toHaveBeenCalledOnce()
    expect(onDown).toHaveBeenCalledOnce()
  })

  /* Ai due capi dell'elenco la freccia si spegne: è lei a dire che non si
   * può salire più su, senza bisogno di un messaggio da leggere. */
  it('spegne la freccia in cima e quella in fondo', () => {
    const { unmount } = render(
      <MoveControls
        label="Primo passo"
        onUp={vi.fn()}
        onDown={vi.fn()}
        canMoveUp={false}
        canMoveDown
      />,
    )
    expect(su()).toBeDisabled()
    expect(giu()).toBeEnabled()
    unmount()

    renderControls({ canMoveDown: false })
    expect(giu()).toBeDisabled()
    expect(su()).toBeEnabled()
  })

  it('non sposta niente quando tutto è bloccato', async () => {
    const { onUp, onDown } = renderControls({ disabled: true })

    await userEvent.click(su())
    await userEvent.click(giu())

    expect(onUp).not.toHaveBeenCalled()
    expect(onDown).not.toHaveBeenCalled()
  })

  /* Le frecce dicono cosa stanno spostando: in un elenco di sei passi,
   * sei coppie di frecce identiche non si distinguerebbero l'una
   * dall'altra per chi legge con uno screen reader. */
  it('dice cosa sta spostando', () => {
    renderControls()

    expect(su()).toBeInTheDocument()
    expect(giu()).toBeInTheDocument()
  })

  it('spiega la freccia viva e tace su quella spenta', async () => {
    renderControls({ canMoveDown: false })

    await userEvent.hover(su())
    expect(screen.getByRole('tooltip')).toHaveTextContent('Sposta in alto')

    await userEvent.unhover(su())
    await userEvent.hover(giu())
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
