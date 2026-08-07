/* Quando una revisione del docente ha qualcosa da dire.
 *
 * In un file a parte perché la domanda se la fanno in tre: la nota che la
 * mostra, il modulo che la scrive e il dettaglio conversazione che decide se
 * lasciare spazio al blocco. Rispondere in tre modi diversi vorrebbe dire
 * un'intestazione vuota in una schermata e niente del tutto in quella
 * accanto. */

import type { ConversationReview } from '../services/api'

/** True quando la revisione ha davvero qualcosa da mostrare: una fatta di
 *  sole annotazioni sui messaggi arriva con l'intestazione vuota. */
export function hasReviewContent(review: ConversationReview | null | undefined): boolean {
  return !!review && !!(review.summary_note || review.override_reason)
}
