/* Formattazione dell'ultimo accesso di un account, in italiano.
 *
 * La colonna serve a distinguere a colpo d'occhio tre situazioni: un invito
 * mai accettato, un account vivo e uno ormai dormiente. Una data assoluta le
 * costringerebbe tutte e tre a un calcolo mentale, quindi in tabella si
 * mostra la distanza da adesso e la data esatta resta nel dettaglio. */

const MS_PER_DAY = 86_400_000

/** Mezzanotte locale, per contare i giorni di calendario e non le 24 ore:
 * un accesso di ieri sera resta "ieri" anche se è passata un'ora sola. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Etichetta mostrata al posto della data quando l'account non è mai stato usato. */
export const NEVER_ACCESSED_LABEL = 'Mai acceduto'

/**
 * Distanza da adesso in italiano: "oggi", "ieri", "3 giorni fa",
 * "2 settimane fa", "5 mesi fa", "1 anno fa".
 *
 * `now` è iniettabile per i test. Le date nel futuro (orologi disallineati
 * tra server e client) ricadono su "oggi", che è l'approssimazione meno
 * sbagliata da mostrare.
 */
export function formatRelativeDay(dateStr: string, now: Date = new Date()): string {
  const then = new Date(dateStr)
  if (Number.isNaN(then.getTime())) return '—'

  const days = Math.round((startOfDay(now) - startOfDay(then)) / MS_PER_DAY)
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 7) return `${days} giorni fa`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1 settimana fa' : `${weeks} settimane fa`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 mese fa' : `${months} mesi fa`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1 anno fa' : `${years} anni fa`
}

/** Data e ora complete "GG mese AAAA, HH:MM", per il tooltip e il dettaglio. */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
