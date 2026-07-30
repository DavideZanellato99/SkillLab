/* Le notifiche di chi sta guardando.
 *
 * Non sono memorizzate da nessuna parte: il server le ricava ogni volta dagli
 * obiettivi assegnati e dalle revisioni del docente, quindi una notifica che
 * ha smesso di essere vera sparisce da sola alla lettura successiva. Per
 * questo la campanella le ricontrolla a intervalli invece di aspettare che
 * qualcosa la invalidi: non esiste una scrittura da cui accorgersene.
 *
 * Segnare come lette risponde con la lista aggiornata, che va direttamente
 * in cache: il contatore si ridisegna senza un secondo giro di rete. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NotificationList } from '../services/notifications'
import { fetchNotifications, markNotificationsRead } from '../services/notifications'
import { queryKeys } from './queryKeys'

/** Ogni quanto la campanella ricontrolla, mentre la pagina è aperta. */
const NOTIFICATIONS_POLL_MS = 1000 * 60 * 2

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: fetchNotifications,
    enabled,
    refetchInterval: enabled ? NOTIFICATIONS_POLL_MS : false,
    /* L'app di norma non rilegge tornando sulla scheda, ma qui sì: rientrare
     * dopo un'ora è il momento in cui la lista in memoria è più vecchia, e
     * vale più di qualunque intervallo. */
    refetchOnWindowFocus: true,
  })
}

/** Segna come lette le chiavi indicate, o tutte quelle visibili se non se ne
 *  passa nessuna: quali siano lo decide il server. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keys?: string[]) => markNotificationsRead(keys),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationList>(queryKeys.notifications, updated)
    },
  })
}
