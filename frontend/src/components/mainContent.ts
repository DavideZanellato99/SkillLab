/* Dove porta il collegamento che salta la barra di navigazione.
 *
 * Sta in un file suo perché la stessa ancora la usano in due punti lontani:
 * il collegamento in cima alla barra, e il `main` di ogni impaginazione, che
 * sono quattro (le pagine dell'applicazione, la galleria, la chat e il sito
 * pubblico). Scritta a mano nei cinque posti, basterebbe una lettera diversa
 * perché il salto porti in cima alla pagina senza dirlo a nessuno. */

export const MAIN_CONTENT_ID = 'contenuto-principale'

/* Il `main` va reso raggiungibile dal salto, e un contenitore non riceve il
 * fuoco da solo: senza `tabIndex` il browser sposterebbe soltanto lo
 * scorrimento, lasciando la tastiera dentro la barra, cioè proprio dove il
 * collegamento serviva a non stare. L'anello di fuoco resta spento perché lo
 * disegnerebbe attorno alla pagina intera, e il fuoco si vede comunque dal
 * primo Tab, che da lì entra nel contenuto. */
export const mainContentProps = {
  id: MAIN_CONTENT_ID,
  tabIndex: -1,
} as const

/** Da unire alle classi del proprio `main`. */
export const mainContentCls = 'outline-none'
