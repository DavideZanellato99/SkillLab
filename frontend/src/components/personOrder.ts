/* L'ordine con cui si elencano delle persone, e il confronto fra due stringhe
 * da cui esce.
 *
 * **Per cognome, poi per nome, poi per email.** È la regola della tabella di
 * gestione utenti, dove la scrive il server (`USER_SORT_COLUMNS` in
 * [admin.py](../../../backend/routers/admin.py), `(cognome, nome, email)`):
 * un elenco di persone si scorre cercando il cognome, e l'email fa da
 * ripiego per chi l'anagrafica non ce l'ha ancora scritta. Qui la stessa
 * regola vale per gli elenchi che il frontend ordina da sé, cioè le tendine
 * in cui si sceglie una persona: due elenchi delle stesse persone ordinati in
 * due modi si leggono come due elenchi diversi.
 *
 * Il collator sta qui perché è lo stesso che ordina le tabelle: costruirlo
 * una volta sola non è un dettaglio, `localeCompare` chiamato coppia per
 * coppia rimette insieme le regole della lingua a ogni confronto, e su un
 * elenco lungo è il grosso del tempo speso a ordinare. */

/** Il confronto fra due testi, con le regole dell'italiano. `numeric` mette
 *  "Tappa 2" prima di "Tappa 10", che è l'ordine che chi legge si aspetta. */
export const collator = new Intl.Collator('it', { sensitivity: 'base', numeric: true })

/** Una persona vista da chi la deve solo mettere in fila. */
export interface OrderablePerson {
  nome: string
  cognome: string
  email: string
}

/**
 * Confronta due persone come fa la tabella di gestione utenti.
 *
 * Il cognome per primo perché è così che si cerca un nome in un elenco, il
 * nome subito dopo per i cognomi che si ripetono, e l'email in fondo: è
 * l'unico campo che c'è sempre, e su un account appena invitato è anche
 * l'unico che si legge.
 */
export function comparePeople(a: OrderablePerson, b: OrderablePerson): number {
  return (
    collator.compare(a.cognome, b.cognome) ||
    collator.compare(a.nome, b.nome) ||
    collator.compare(a.email, b.email)
  )
}
