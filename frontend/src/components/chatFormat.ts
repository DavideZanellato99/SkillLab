/* Formattazione di date e orari delle conversazioni, in italiano. Estratti da
 * ChatPage perché condivisi dalle bolle dei messaggi e dalle liste delle
 * conversazioni (sidebar e pannello espanso). */

/** Orario "HH:MM" (es. "09:05"), per il timestamp di una bolla. */
export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** Data breve "GG mese AAAA" (es. "05 mar 2026"), per le liste. */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
