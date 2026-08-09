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

/* Stessa lacuna, altro metodo: jsdom non implementa `scrollIntoView`, e le
 * tendine dell'app lo chiamano per tenere in vista la voce evidenziata (vedi
 * Select e SearchSelect). Senza questo, aprire una tendina dentro un test fa
 * esplodere l'ambiente invece della cosa che si stava provando. In jsdom non
 * si scorre niente, quindi il corpo vuoto è la sostituzione giusta. */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

/* E `scrollTo` su un elemento, che la mappa dei percorsi chiama per portare
 * al centro la tappa di adesso (vedi PathTrailMap). Come sopra: in jsdom non
 * c'è niente da scorrere, e quello che il test guarda è cosa viene disegnato,
 * non dove si è fermata la finestra. */
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}

afterEach(() => {
  cleanup()
})
