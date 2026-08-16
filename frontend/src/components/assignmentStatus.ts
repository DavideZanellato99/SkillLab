/* Come si chiama e di che colore è lo stato di un percorso assegnato.
 *
 * In un file a parte dalla targhetta che lo disegna perché la parola serve
 * anche dove la targhetta non c'è: la ricerca della tabella di gestione si fa
 * sullo stesso testo che si legge sulla riga, e chi cerca "scaduto" si
 * aspetta di trovare i percorsi scaduti. */

import type { AssignmentStatus } from '../services/training'

export const STATUS_META: Record<AssignmentStatus, { label: string; cls: string }> = {
  /* Solo di una tappa, mai di un percorso: quello resta in corso finché ha
   * qualcosa da fare. Grigia e senza accento, perché è l'unico stato in cui
   * non c'è niente da fare. */
  locked: { label: 'Bloccata', cls: 'border-white/10 bg-white/4 text-slate-500' },
  active: { label: 'In Corso', cls: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' },
  overdue: { label: 'Scaduto', cls: 'border-red-500/30 bg-red-500/10 text-red-400' },
  completed: {
    label: 'Completato',
    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  completed_late: {
    label: 'Completato in Ritardo',
    cls: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  },
}
