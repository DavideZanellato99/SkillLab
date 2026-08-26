/* Le date e gli orari dell'app, in italiano, in un posto solo.
 *
 * Erano quattro: la formattazione dell'ultimo accesso, quella delle bolle
 * della chat, quella dei test consegnati e una scritta a mano dentro il
 * dettaglio di una conversazione. Le prime due erano la stessa funzione
 * ricopiata, e le ultime due leggevano la data con `new Date` invece che
 * come UTC: lo stesso momento usciva quindi con due orari diversi a seconda
 * di quale schermata lo mostrava, e nel report attività i due si vedevano a
 * un clic di distanza, la riga con l'ora giusta e la trascrizione con
 * quella spostata dal fuso di chi guardava.
 *
 * Da qui passa ogni momento prima di essere mostrato, e la lettura è una
 * sola: `parseInstant`, che sa che le colonne dello schema sono in UTC senza
 * fuso scritto (vedi [instant.ts](./instant.ts)). Nell'altro verso, cioè un
 * momento che torna dentro un campo data, sta ancora lì. */

import { parseInstant } from './instant'

const MS_PER_DAY = 86_400_000

/** Mezzanotte locale, per contare i giorni di calendario e non le 24 ore:
 * un accesso di ieri sera resta "ieri" anche se è passata un'ora sola. */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Etichetta mostrata al posto della data quando l'account non è mai stato usato. */
export const NEVER_ACCESSED_LABEL = 'Mai Acceduto'

/**
 * Distanza da adesso in italiano: "oggi", "ieri", "3 giorni fa",
 * "2 settimane fa", "5 mesi fa", "1 anno fa".
 *
 * Serve alla colonna dell'ultimo accesso, che deve distinguere a colpo
 * d'occhio tre situazioni: un invito mai accettato, un account vivo e uno
 * ormai dormiente. Una data assoluta le costringerebbe tutte e tre a un
 * calcolo mentale, quindi in tabella si mostra la distanza da adesso e la
 * data esatta resta nel dettaglio.
 *
 * `now` è iniettabile per i test. Le date nel futuro (orologi disallineati
 * tra server e client) ricadono su "oggi", che è l'approssimazione meno
 * sbagliata da mostrare.
 */
export function formatRelativeDay(dateStr: string, now: Date = new Date()): string {
  const then = parseInstant(dateStr)
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

/* Solo la data "GG mese AAAA", per le colonne di creazione delle tabelle di
 * amministrazione e per le liste delle conversazioni: lì di una riga
 * interessa il giorno in cui è nata, e l'ora è una precisione che nessuno
 * legge e che allunga la colonna. */
export function formatDate(dateStr: string): string {
  return parseInstant(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Data e ora complete "GG mese AAAA, HH:MM", per i tooltip e i dettagli. */
export function formatDateTime(dateStr: string): string {
  return parseInstant(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Il solo orario "HH:MM", per il timestamp di un messaggio: dentro una
 *  trascrizione la data è già scritta in testa, e ripeterla su ogni riga
 *  coprirebbe l'unica cosa che lì cambia, cioè l'ora. */
export function formatTime(dateStr: string): string {
  return parseInstant(dateStr).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
