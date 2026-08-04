/* Numeri, colori e misure con cui si legge un voto: la dashboard e il
 * confronto, sulle conversazioni come sui test tecnici.
 *
 * Stanno qui perché una fascia verde che cambia soglia da una schermata
 * all'altra, o da una sezione alla sezione accanto, farebbe sembrare diversi
 * due sette uguali. */

/** Il voto in decimi come si scrive in italiano: 7,5 e non 7.5. */
export { formatScore } from './simulationFormat'

export const cardCls = 'rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md'

/* Stessa convenzione colori dell'EvaluationModal: ≥7 verde, ≥5 arancio, <5 rosso.
 * Vale anche sui voti dei test scritti: dentro una pagina la scala è una, e
 * le soglie scolastiche del simulatore (6 e 8) restano dove si legge un voto
 * per volta, cioè nell'esito e nell'elenco delle simulazioni. */
export function scoreTextColor(score: number): string {
  if (score >= 7) return 'text-emerald-400'
  if (score >= 5) return 'text-orange-400'
  return 'text-red-400'
}

export function scoreBarColor(score: number): string {
  if (score >= 7) return 'bg-emerald-500'
  if (score >= 5) return 'bg-orange-500'
  return 'bg-red-500'
}

/** Data e ora brevi, senza anno: nelle tabelle della dashboard le righe
 *  sono recenti e l'anno ripetuto su ogni riga non dice niente. */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Chi ha svolto la prova: nome e cognome se ci sono, altrimenti l'email. */
export function personName(row: {
  user_nome: string
  user_cognome: string
  user_email: string
}): string {
  return row.user_nome && row.user_cognome ? `${row.user_nome} ${row.user_cognome}` : row.user_email
}

/** Etichetta dell'asse X del grafico a linee: "05/03". */
export function formatDay(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
}

/** Un punto dell'andamento: la media di una giornata e su quanti valori. */
export interface DayPoint {
  date: Date
  avg: number
  count: number
}

/* Media giornaliera di un insieme di righe con data e voto, ordinata nel
 * tempo. La usano l'andamento delle valutazioni e quello dei tentativi:
 * cambiano i campi da cui si leggono data e voto, non il calcolo. */
export function dailyAverages<T>(
  rows: T[],
  at: (row: T) => string,
  score: (row: T) => number,
): DayPoint[] {
  const byDay = new Map<string, { sum: number; count: number; date: Date }>()
  for (const row of rows) {
    const d = new Date(at(row))
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const entry = byDay.get(key) ?? {
      sum: 0,
      count: 0,
      date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
    }
    entry.sum += score(row)
    entry.count += 1
    byDay.set(key, entry)
  }
  return Array.from(byDay.values())
    .map((e) => ({ date: e.date, avg: e.sum / e.count, count: e.count }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}
