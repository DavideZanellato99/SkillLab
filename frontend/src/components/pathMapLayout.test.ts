import { describe, expect, it } from 'vitest'

import { ROW_HEIGHT, litUntil, trailHeight, trailNodes, trailPath } from './pathMapLayout'

/* Quello che questi test tengono fermo è l'unica cosa della mappa che può
 * mentire senza sembrare rotta: quanto sentiero risulta già camminato, e che
 * le tappe scendano una sotto l'altra invece di sovrapporsi. */

describe('trailNodes', () => {
  it('scende di una riga a ogni tappa', () => {
    const nodes = trailNodes(4)

    expect(nodes).toHaveLength(4)
    expect(nodes[1].y - nodes[0].y).toBe(ROW_HEIGHT)
    expect(nodes[3].y - nodes[2].y).toBe(ROW_HEIGHT)
  })

  it('scosta il sentiero dal centro a destra e a sinistra', () => {
    const [primo, secondo, terzo, quarto] = trailNodes(4)

    expect(primo.x).toBe(50)
    expect(secondo.x).toBeGreaterThan(primo.x)
    expect(terzo.x).toBe(50)
    expect(quarto.x).toBeLessThan(primo.x)
  })

  it('resta dentro la larghezza disponibile', () => {
    for (const node of trailNodes(12)) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x).toBeLessThanOrEqual(100)
    }
  })

  it('rimpicciolita accorcia le distanze e non la larghezza', () => {
    const intera = trailNodes(6)
    const ridotta = trailNodes(6, 0.5)

    expect(ridotta).toHaveLength(intera.length)
    expect(ridotta[5].y).toBe(intera[5].y / 2)
    // La `x` è una percentuale: il sentiero resta largo quanto la finestra
    expect(ridotta.map((n) => n.x)).toEqual(intera.map((n) => n.x))
    expect(trailHeight(6, 0.5)).toBe(trailHeight(6) / 2)
  })
})

describe('trailPath', () => {
  it('parte dal primo nodo e tocca tutti gli altri', () => {
    const nodes = trailNodes(3)
    const d = trailPath(nodes)

    expect(d.startsWith(`M ${nodes[0].x} ${nodes[0].y}`)).toBe(true)
    expect(d).toContain(`${nodes[1].x} ${nodes[1].y}`)
    expect(d).toContain(`${nodes[2].x} ${nodes[2].y}`)
  })

  it('non disegna niente senza tappe', () => {
    expect(trailPath([])).toBe('')
    expect(trailHeight(0)).toBe(0)
  })
})

describe('litUntil', () => {
  const nodes = trailNodes(5)

  it('accende un tratto quando la tappa a cui porta si sblocca', () => {
    // Superata la prima, la luce arriva alla seconda e si ferma lì
    expect(litUntil(nodes, 1)).toBe(nodes[1].y)
    expect(litUntil(nodes, 2)).toBe(nodes[2].y)
  })

  it('tiene il sentiero spento finché non si supera niente', () => {
    expect(litUntil(nodes, 0)).toBe(0)
    expect(litUntil([], 3)).toBe(0)
  })

  it("a percorso chiuso arriva all'ultima tappa e non oltre", () => {
    expect(litUntil(nodes, 5)).toBe(nodes[4].y)
    expect(litUntil(nodes, 9)).toBe(nodes[4].y)
  })
})
