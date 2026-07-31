/* Chi ha creato una riga e chi l'ha modificata per ultimo.
 *
 * Le stesse quattro colonne su utenti, organizzazioni e avatar (lato server
 * stanno in backend/authorship.py), quindi un tipo solo e un componente solo
 * a mostrarle: vedi AuthorshipFields. */

export interface Authored {
  created_at: string
  /** Email di chi ha creato la riga, oppure una delle due etichette sotto. */
  created_by_email: string
  updated_at: string
  updated_by_email: string
}

/* Le due etichette che il server scrive al posto di un indirizzo. Sono valori
 * che arrivano dal backend, non testo dell'interfaccia: se cambiano lì vanno
 * cambiate qui, ed è per questo che stanno accanto al tipo che le porta. */
const SYSTEM_ACTOR_EMAIL = 'sistema'
const DELETED_ACTOR_EMAIL = 'utente eliminato'

/** L'autore come si legge in una frase: "da mario@rossi.it", "dal sistema". */
export function authorLabel(email: string): string {
  if (email === SYSTEM_ACTOR_EMAIL) return 'dal sistema'
  if (email === DELETED_ACTOR_EMAIL) return 'da un utente eliminato'
  return `da ${email}`
}

/** Vero quando al posto dell'autore c'è un'etichetta, non una persona. */
export const isPlaceholderAuthor = (email: string) =>
  email === SYSTEM_ACTOR_EMAIL || email === DELETED_ACTOR_EMAIL
