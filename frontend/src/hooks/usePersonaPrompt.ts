/* L'anteprima del prompt che una scheda persona produce: quello che l'avatar
 * riceve davvero, per il canale scelto.
 *
 * La scheda intera entra nella chiave, e va bene che sia un oggetto: TanStack
 * la confronta per contenuto, non per identità. Prima l'anteprima era una
 * fetch dentro un useEffect che dipendeva da `profile`, quindi ripartiva ogni
 * volta che il form ne ricreava l'oggetto anche senza cambiare un carattere;
 * ora riparte quando la scheda cambia davvero, e tornare su un canale già
 * visto non richiede nulla. */

import { useQuery } from '@tanstack/react-query'
import type { PersonaChannel } from '../services/admin'
import { previewPersonaPrompt } from '../services/admin'
import { queryKeys } from './queryKeys'

export function usePersonaPromptPreview(profile: Record<string, string>, channel: PersonaChannel) {
  return useQuery({
    queryKey: queryKeys.personaPrompt(profile, channel),
    queryFn: () => previewPersonaPrompt(profile, channel),
    /* Non scade mai: il server compone un testo dalla scheda, senza leggere
     * niente e senza chiedere niente a un modello, quindi la stessa scheda
     * sullo stesso canale dà sempre la stessa risposta. Rileggerla al ritorno
     * sulla scheda sarebbe una richiesta certa di non portare nulla. */
    staleTime: Infinity,
  })
}
