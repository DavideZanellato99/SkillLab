/* Numeri, colori e misure con cui si legge un voto: la dashboard e il
 * confronto, sulle conversazioni come sui test tecnici.
 *
 * Stanno qui perché una fascia verde che cambia soglia da una schermata
 * all'altra, o da una sezione alla sezione accanto, farebbe sembrare diversi
 * due sette uguali. */

/** Il voto in decimi come si scrive in italiano: 7,5 e non 7.5. */
export { formatScore } from './simulationFormat'
import { PASS_SCORE } from './simulationFormat'

/* I due formattatori della dashboard, costruiti una volta sola invece che a
 * ogni cella: il perché sta su `formatInstant` in [instant.ts](./instant.ts). */
const DAY_MONTH_TIME = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const DAY_MONTH_NUMERIC = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' })

export const cardCls = 'rounded-2xl border border-white/6 bg-gray-900/60 p-6 backdrop-blur-md'

/* Due fasce e una soglia sola, la sufficienza di `scoreBadgeTone` in
 * [simulationFormat.ts](./simulationFormat.ts): dal sei verde, sotto
 * arancione. Un voto si colora allo stesso modo ovunque lo si legga, in una
 * pagella, in una tabella della dashboard o su una barra. */
export function scoreTextColor(score: number): string {
  return score >= PASS_SCORE ? 'text-emerald-400' : 'text-orange-400'
}

export function scoreBarColor(score: number): string {
  return score >= PASS_SCORE ? 'bg-emerald-500' : 'bg-orange-500'
}

/** Data e ora brevi, senza anno: nelle tabelle della dashboard le righe
 *  sono recenti e l'anno ripetuto su ogni riga non dice niente. */
export function formatDateTime(dateStr: string): string {
  const when = new Date(dateStr)
  return Number.isNaN(when.getTime()) ? '—' : DAY_MONTH_TIME.format(when)
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
  return DAY_MONTH_NUMERIC.format(date)
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

/** La media di un criterio nei dati che si stanno guardando.
 *
 * L'etichetta viaggia accanto alla chiave perché è del server: arriva col
 * vocabolario della risposta (`criteria_labels`), e qui non se ne tiene una
 * copia. La usano la vista dei punteggi, che la calcola sulle valutazioni
 * caricate, e la tabella che ne fa le proprie colonne.
 */
export interface CriterionAverage {
  key: string
  label: string
  avg: number
}
