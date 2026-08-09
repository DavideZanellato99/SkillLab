/* Un momento che arriva dal server, e lo stesso momento dentro un campo data.
 *
 * Le colonne temporali dello schema sono in UTC e senza fuso scritto, quindi
 * una risposta porta "2026-08-12T17:00:00" e basta. `new Date` su una stringa
 * così la legge come ora locale: su una data sola lo scarto non si vede, su
 * una scadenza con l'ora sì, ed è di un'ora o due sbagliate nel verso in cui
 * più conta. Da qui passa quindi ogni momento prima di essere mostrato.
 *
 * Nell'altro verso vale lo stesso: `datetime-local` parla nell'ora di chi lo
 * compila, e il valore che gli si dà deve essere già stato riportato lì. */

/** Il momento vero, leggendo come UTC quello che il fuso non ce l'ha. */
export function parseInstant(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  return new Date(hasZone ? value : `${value}Z`)
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** Il valore di un campo `datetime-local`: ora locale, al minuto. */
export function toLocalInputValue(value: string): string {
  const when = parseInstant(value)
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `T${pad(when.getHours())}:${pad(when.getMinutes())}`
  )
}

/**
 * Da quel campo al momento da mandare al server.
 *
 * Il campo non porta il fuso, e il browser lo legge nel proprio: è quello
 * giusto, perché è l'ora che chi compone il percorso ha in mente. Da lì la
 * stringa esce in UTC, con il fuso scritto, e il server la mette in colonna
 * senza doverla indovinare.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const when = new Date(value)
  return Number.isNaN(when.getTime()) ? null : when.toISOString()
}
