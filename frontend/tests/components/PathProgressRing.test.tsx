import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PathProgressRing from '../../src/components/PathProgressRing'

describe('PathProgressRing', () => {
  it('dice a che punto è il percorso', () => {
    render(<PathProgressRing done={2} total={5} />)

    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  /* Un percorso senza tappe non è "tutto fatto": dividere per zero darebbe
   * un anello pieno su un percorso in cui non si è fatto niente. */
  it('non dà per finito un percorso senza tappe', () => {
    const { container } = render(<PathProgressRing done={0} total={0} />)

    expect(screen.getByText('0/0')).toBeInTheDocument()
    const arco = container.querySelectorAll('circle')[1]
    // L'arco resta lungo quanto tutta la circonferenza, cioè invisibile
    expect(arco.getAttribute('stroke-dashoffset')).toBe(arco.getAttribute('stroke-dasharray'))
  })

  it("chiude del tutto l'anello a percorso finito", () => {
    const { container } = render(<PathProgressRing done={3} total={3} />)

    const arco = container.querySelectorAll('circle')[1]
    expect(arco.getAttribute('stroke-dashoffset')).toBe('0')
  })

  /* Due anelli sulla stessa pagina sono la norma nell'elenco dei percorsi:
   * con un `id` di gradiente ripetuto il secondo `defs` sovrascriverebbe il
   * primo e gli anelli si tingerebbero a caso. */
  it('dà a ogni anello un gradiente suo', () => {
    const { container } = render(
      <>
        <PathProgressRing done={1} total={4} />
        <PathProgressRing done={2} total={4} />
      </>,
    )

    const gradienti = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(new Set(gradienti).size).toBe(2)
    // Niente due punti: dentro un url(#...) non tutti i browser li digeriscono
    for (const id of gradienti) expect(id).not.toContain(':')
  })

  it('rispetta la misura richiesta', () => {
    const { container } = render(<PathProgressRing done={1} total={2} size={80} />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '80')
    expect(svg).toHaveAttribute('height', '80')
  })
})
