/* I numeri dell'app scritti all'italiana, in un posto solo.
 *
 * Il formattatore sta qui come costante di modulo e non dentro la funzione:
 * `toLocaleString` con delle opzioni ne costruisce uno nuovo a ogni chiamata,
 * ed è quella costruzione a costare, non la scrittura del numero. Un voto si
 * scrive una volta per cella, e le tabelle della dashboard di celle ne hanno
 * centinaia. */

const ONE_DECIMAL = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 })

/** Un numero con al più un decimale: 7,5 e non 7.5. */
export function formatDecimal(value: number): string {
  return ONE_DECIMAL.format(value)
}
