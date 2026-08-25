/* Il messaggio da mostrare quando una scrittura fallisce.
 *
 * `apiFetch` rifiuta sempre con un Error che porta il testo del server, ma
 * chi lo riceve lo vede come `unknown`: TanStack Query tipizza così l'errore
 * di una query, e una promessa può essere rifiutata con qualunque cosa. Senza
 * il controllo, il banner mostrerebbe "[object Object]" proprio nel momento in
 * cui serve una spiegazione.
 *
 * Era la stessa funzione di due righe ricopiata in sei file, con sei nomi
 * quasi uguali: qui è una sola, e il testo di ripiego resta a chi chiama
 * perché dipende da cosa si stava facendo, non da com'è fatto l'errore.
 *
 * La stringa vuota per "nessun errore" non è una svista: i banner dell'app
 * (FormError, FormSuccess) si mostrano su un testo non vuoto, quindi il
 * risultato si passa direttamente senza un ternario per il caso normale. */

export function errorMessage(error: unknown, fallback: string): string {
  if (!error) return ''
  return error instanceof Error ? error.message : fallback
}
