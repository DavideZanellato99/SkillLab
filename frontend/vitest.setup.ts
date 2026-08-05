// Adds the jest-dom matchers (toBeInTheDocument, toHaveClass, ...) to
// Vitest's expect, and cleans the DOM between tests.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/* jsdom non ha ResizeObserver, e i grafici lo usano per adattarsi alla
 * larghezza del contenitore (vedi scoreCharts). Senza questo, montare una
 * qualunque schermata che disegna un grafico esplode su una lacuna
 * dell'ambiente e non su qualcosa che il test stava provando. Non fa niente
 * apposta: in jsdom nessun elemento cambia misura, quindi non c'è nessuna
 * variazione da notificare e i grafici restano alla loro larghezza iniziale. */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

afterEach(() => {
  cleanup()
})
