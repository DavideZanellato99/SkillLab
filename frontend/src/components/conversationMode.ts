/* Come si chiama e come si filtra il canale di una conversazione.
 *
 * In un file a parte, accanto al badge che lo disegna, per la stessa ragione
 * di `simulationFormat`: la parola serve anche dove il badge non c'è, cioè
 * alle ricerche delle tabelle e ai selettori, e due elenchi separati
 * finirebbero per offrire scelte diverse nelle due schermate. */

import type { ConversationMode } from '../services/api'

/** The word the badge shows, also what table search matches the channel on. */
export function conversationModeLabel(mode: ConversationMode): string {
  return mode === 'text' ? 'Chat' : 'Chiamata'
}

/** Un canale, o tutti e due insieme. */
export type ModeFilter = ConversationMode | 'all'

/* Come si sceglie il canale da guardare, ovunque lo si scelga: la dashboard
 * sopra i suoi grafici e il report attività sopra lo storico di una persona.
 *
 * Il default invece non sta qui: la dashboard parte dalle chiamate perché una
 * media che mescola i due canali è ambigua, il report da entrambe perché lì
 * si guarda cosa una persona ha fatto e nasconderne metà sarebbe una risposta
 * incompleta. */
export const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: 'voice', label: 'Chiamate' },
  { value: 'text', label: 'Chat' },
  { value: 'all', label: 'Entrambe' },
]
