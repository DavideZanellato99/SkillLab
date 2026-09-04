/* I quadri d'insieme su una persona: rileggerli tutti, e farne scrivere uno.
 *
 * Sta in un file suo e non fra i report perché non è un report: quelli sono
 * letture che il server ricalcola a ogni richiesta, questi sono testi che
 * esistono solo dopo che qualcuno ha deciso di farli scrivere, e che costano
 * una chiamata a un modello di ragionamento ciascuno.
 *
 * Da qui viene anche la differenza di cache. Un report scade dopo tre
 * minuti perché nel frattempo la gente si allena; uno storico di debriefing
 * non scade mai da solo, perché cresce soltanto quando qualcuno ne fa
 * scrivere uno, e a dire che il più recente è invecchiato c'è `is_stale`,
 * che arriva dentro la risposta. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUserDebriefings, generateUserDebriefing } from '../services/admin'
import type { UserDebriefing } from '../services/admin'
import { fetchPathDebriefings, generatePathDebriefing } from '../services/training'
import type { PathDebriefing } from '../services/training'
import { queryKeys } from './queryKeys'

/** I quadri scritti su una persona, dal più recente. Vuoto se non ce n'è. */
export function useUserDebriefings(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debriefings.byUser(userId),
    queryFn: () => fetchUserDebriefings(userId),
    enabled,
    /* Non invecchia da solo: la lista cambia solo per una generazione, e
     * quella passa dalla mutation qui sotto, che scrive il risultato in
     * cache. Rileggerla a ogni apertura del pannello sarebbe una richiesta
     * che riporta indietro le stesse righe. Il fatto che nel frattempo
     * siano arrivate prove nuove lo dice `is_stale`, che il server calcola
     * quando la risposta viene comunque prodotta. */
    staleTime: Infinity,
  })
}

/** Fa scrivere un quadro nuovo, che si mette davanti a quelli di prima.
 *
 * L'attesa è lunga, perché il modello legge le trascrizioni e il quadro
 * precedente prima di scrivere: chi la lancia resta davanti a una rotella, e
 * per questo il risultato viene messo in cima alla lista in cache invece di
 * essere richiesto di nuovo.
 *
 * Solo in testa, e il resto della lista resta com'è: le versioni vecchie non
 * cambiano mai, e `is_stale` di quella che era prima la più recente diventa
 * falso da solo, perché il server lo calcola soltanto sulla prima. */
export function useGenerateDebriefing(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generateUserDebriefing(userId),
    onSuccess: (debriefing: UserDebriefing) => {
      queryClient.setQueryData<UserDebriefing[]>(
        queryKeys.debriefings.byUser(userId),
        (storico = []) => [debriefing, ...storico.map((v) => ({ ...v, is_stale: false }))],
      )
    },
  })
}

/** I quadri scritti su un percorso, dal più recente. Vuoto se non ce n'è.
 *
 * Qui la cache scade come il resto dell'applicazione, e non mai come lo
 * storico di una persona: quello cambia solo quando qualcuno ne fa scrivere
 * uno, mentre di questo cambia anche il motivo per cui è vecchio, che matura
 * da sé mentre il gruppo si allena e quando qualcuno riscrive le tappe. */
export function usePathDebriefings(pathId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debriefings.byPath(pathId),
    queryFn: () => fetchPathDebriefings(pathId),
    enabled,
  })
}

/** Ne fa scrivere uno, che si mette davanti a quelli di prima.
 *
 * Il risultato va in cima alla lista in cache invece di essere richiesto di
 * nuovo: l'attesa è lunga, e chi l'ha lanciata è rimasto davanti a una
 * rotella. Il segnale di vecchio di quello che era il più recente si spegne
 * da sé, perché il server lo calcola soltanto sul primo. */
export function useGeneratePathDebriefing(pathId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generatePathDebriefing(pathId),
    onSuccess: (debriefing: PathDebriefing) => {
      queryClient.setQueryData<PathDebriefing[]>(
        queryKeys.debriefings.byPath(pathId),
        (storico = []) => [debriefing, ...storico.map((v) => ({ ...v, stale_reason: null }))],
      )
    },
  })
}
