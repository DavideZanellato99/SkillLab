import { useEffect, useState } from 'react'

/* Il valore che aspetta un attimo prima di contare davvero.
 *
 * Serve alle caselle di ricerca che interrogano il server: quello che si
 * digita entra nella chiave di cache, quindi senza attesa ogni tasto premuto
 * sarebbe una richiesta, e "mario" ne farebbe cinque per una risposta sola
 * che interessa.
 *
 * Erano le stesse cinque righe con lo stesso ritardo in ogni pagina che
 * cerca, ognuna con la propria coppia di stati da tenere allineati. */

/** Quanto si aspetta la fine della digitazione, uguale in tutte le ricerche. */
export const SEARCH_DEBOUNCE_MS = 400

export function useDebouncedValue<T>(value: T, delay: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
