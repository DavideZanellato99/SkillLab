import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TabBar from '../../src/components/TabBar'

const linguette = [
  { value: 'conversazioni', label: 'Conversazioni' },
  { value: 'simulazioni', label: 'Simulazioni' },
]

function renderTabs(value = 'conversazioni') {
  const onChange = vi.fn()
  render(<TabBar items={linguette} value={value} onChange={onChange} ariaLabel="Cosa guardare" />)
  return onChange
}

describe('TabBar', () => {
  it('mostra una linguetta per voce', () => {
    renderTabs()

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('tablist', { name: 'Cosa guardare' })).toBeInTheDocument()
  })

  /* Quale linguetta è aperta lo dice `aria-selected` e non solo il colore:
   * chi legge con uno screen reader non ha nessun altro modo di saperlo. */
  it('dice quale linguetta è aperta', () => {
    renderTabs('simulazioni')

    expect(screen.getByRole('tab', { name: 'Conversazioni' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tab', { name: 'Simulazioni' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('annuncia la linguetta scelta', async () => {
    const onChange = renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: 'Simulazioni' }))

    expect(onChange).toHaveBeenCalledWith('simulazioni')
  })

  /* Ricliccare quella già aperta la richiede lo stesso: è chi la usa a
   * decidere cosa farne, e ignorarla qui renderebbe impossibile usare le
   * linguette per ricaricare quello che si sta guardando. */
  it('annuncia anche la linguetta già aperta', async () => {
    const onChange = renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: 'Conversazioni' }))

    expect(onChange).toHaveBeenCalledWith('conversazioni')
  })

  it('non disegna nessuna linguetta se non ce ne sono', () => {
    render(<TabBar items={[]} value="" onChange={vi.fn()} ariaLabel="Vuoto" />)

    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })
})
