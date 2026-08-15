/* Il quadro d'insieme su una persona: leggerlo e farlo riscrivere.
 *
 * Sta in un file suo e non fra i report perché non è un report: quelli sono
 * letture che il server ricalcola a ogni richiesta, questo è un testo che
 * esiste solo dopo che qualcuno ha deciso di farlo scrivere, e che costa una
 * chiamata a un modello di ragionamento ogni volta.
 *
 * Da qui viene anche la differenza di cache. Un report scade dopo tre
 * minuti perché nel frattempo la gente si allena; un debriefing non scade
 * mai da solo, perché cambia soltanto quando qualcuno lo rigenera, e a dire
 * che è invecchiato c'è `is_stale`, che arriva dentro la risposta. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUserDebriefing, generateUserDebriefing } from '../services/admin'
import type { UserDebriefing } from '../services/admin'
import { queryKeys } from './queryKeys'

/** Il debriefing salvato di una persona, o null se non è mai stato chiesto. */
export function useUserDebriefing(userId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debriefings.byUser(userId),
    queryFn: () => fetchUserDebriefing(userId),
    enabled,
    /* Non invecchia da solo: il testo cambia solo per una rigenerazione, e
     * quella passa dalla mutation qui sotto, che scrive il risultato in
     * cache. Rileggerlo a ogni apertura del pannello sarebbe una richiesta
     * che riporta indietro le stesse righe. Il fatto che nel frattempo
     * siano arrivate prove nuove lo dice `is_stale`, che il server calcola
     * quando la risposta viene comunque prodotta. */
    staleTime: Infinity,
  })
}

/** Fa scrivere il quadro d'insieme, sostituendo quello che c'era.
 *
 * L'attesa è lunga, perché il modello legge le trascrizioni prima di
 * scrivere: chi la lancia resta davanti a una rotella, e per questo il
 * risultato viene scritto in cache invece di essere richiesto di nuovo. */
export function useGenerateDebriefing(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => generateUserDebriefing(userId),
    onSuccess: (debriefing: UserDebriefing) => {
      queryClient.setQueryData(queryKeys.debriefings.byUser(userId), debriefing)
    },
  })
}
