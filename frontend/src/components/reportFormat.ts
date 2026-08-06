/* Le misure del report attività: su che periodo si guarda e quanto è durata
 * una prova.
 *
 * In un file a parte perché la pagina e il dettaglio che si apre sotto la
 * riga scrivono gli stessi numeri, e una durata formattata in due modi nella
 * stessa schermata è una durata che non si legge. */

/** I periodi su cui si può restringere il report. "Sempre" è il default: un
 * filtro che parte già acceso mostrerebbe una tabella mezza vuota a chi non
 * sa che esiste, e quella si legge come un dato sbagliato invece che come
 * una scelta. */
export const PERIOD_OPTIONS = [
  { value: 'all', label: 'Sempre' },
  { value: '7', label: '7 giorni' },
  { value: '30', label: '30 giorni' },
  { value: '90', label: '90 giorni' },
] as const

export type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value']

/** "1 h 05 min", "12 min 34 s", "45 s". "—" su una durata nulla o ignota. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`
  return `${s} s`
}
