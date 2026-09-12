import { describe, expect, it } from 'vitest'

import { TOOLTIP_MARK, clippedTexts, isTruncated } from '../../src/components/truncation'

/* jsdom non impagina niente: ogni misura è zero e niente risulta tagliato.
 * Il taglio si simula scrivendo le due misure a mano sull'elemento, che è
 * esattamente il confronto su cui la regola si basa. */
function clip(el: Element, clipped = true) {
  Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: clipped ? 300 : 100, configurable: true })
}

function cell(html: string) {
  const td = document.createElement('td')
  td.innerHTML = html
  return td
}

describe('cosa è stato tagliato', () => {
  it('niente, su un testo che si legge per intero', () => {
    const td = cell('Anna Rossi')
    clip(td, false)

    expect(isTruncated(td)).toBe(false)
    expect(clippedTexts(td)).toEqual([])
  })

  it('il testo diretto della cella', () => {
    const td = cell('Un titolo molto lungo')
    clip(td)

    expect(isTruncated(td)).toBe(true)
    expect(clippedTexts(td)).toEqual(['Un titolo molto lungo'])
  })

  it('ogni pezzo tagliato dentro la cella, una volta sola', () => {
    const td = cell(
      '<div><span id="nome">Anna Rossi</span><span id="mail">anna@test.it</span></div>',
    )
    clip(td, false)
    clip(td.querySelector('#nome')!)
    clip(td.querySelector('#mail')!)

    expect(clippedTexts(td)).toEqual(['Anna Rossi', 'anna@test.it'])
  })

  /* Quando il riquadro e il testo dentro risultano tagliati tutti e due, il
   * testo è quello che conta: il riquadro lo ripeterebbe insieme al resto. */
  it('tiene il pezzo più interno e non il riquadro che lo contiene', () => {
    const td = cell('<div id="box"><span id="nome">Anna Rossi</span> <b>admin</b></div>')
    clip(td)
    clip(td.querySelector('#box')!)
    clip(td.querySelector('#nome')!)

    expect(clippedTexts(td)).toEqual(['Anna Rossi'])
  })

  /* Un pezzo con un tooltip suo è affar suo: la cella non lo ripete, e non
   * si considera nemmeno tagliata per lui. */
  it('lascia fuori un pezzo che porta il proprio tooltip', () => {
    const td = cell(`<span ${TOOLTIP_MARK}="">registro lungo</span><span id="altro">ok</span>`)
    clip(td, false)
    clip(td.querySelector(`[${TOOLTIP_MARK}]`)!)

    expect(isTruncated(td)).toBe(false)
    expect(clippedTexts(td)).toEqual([])
  })
})
