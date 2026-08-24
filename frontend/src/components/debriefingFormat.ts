/* Come si scrive, in interfaccia, la direzione di un quadro d'insieme.
 *
 * Tre parole e tre colori, in un file loro perché li usano due componenti
 * che non si conoscono: il quadro aperto per intero e la riga compatta dello
 * storico. Due copie si allontanerebbero al primo ripensamento sul tono, e
 * la stessa persona risulterebbe in miglioramento di due colori diversi
 * nella stessa schermata.
 *
 * La direzione non è lo scarto delle medie, ed è voluto che siano due cose
 * separate: quella la legge il modello nel modo di lavorare, lo scarto è una
 * sottrazione fra due voti. Una persona può salire di mezzo punto e restare
 * ferma, ed è il caso in cui questa etichetta serve davvero. */

import type { DebriefingDirection } from '../services/admin'

interface DirectionStyle {
  label: string
  tone: string
}

const DIRECTION_STYLES: Record<DebriefingDirection, DirectionStyle> = {
  up: {
    label: 'In miglioramento',
    tone: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  stable: {
    label: 'Stabile',
    tone: 'border border-white/10 bg-white/5 text-slate-400',
  },
  down: {
    label: 'In peggioramento',
    tone: 'border border-red-500/30 bg-red-500/10 text-red-400',
  },
}

/** L'etichetta e il colore di una direzione, o null sul primo quadro.
 *
 * Null e non un valore di ripiego: il primo quadro di una persona non è
 * stabile, è il primo, e disegnarlo come stabile direbbe che qualcuno ha
 * guardato se si era mosso. */
export function directionStyle(direction: DebriefingDirection | null): DirectionStyle | null {
  return direction ? DIRECTION_STYLES[direction] : null
}
