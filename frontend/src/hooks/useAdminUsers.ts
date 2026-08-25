/* Gli utenti visti dal super admin: l'elenco filtrato e le azioni su un
 * account (crearlo, modificarlo, sospenderlo, rimandargli le credenziali,
 * eliminarlo).
 *
 * L'elenco cresce con ogni organizzazione, quindi si legge a finestre.
 * `useInfiniteQuery` fa qui due cose che prima erano scritte a mano: tiene
 * le pagine già chieste quando se ne aggiunge una, e su invalidazione le
 * rilegge tutte, cioè riporta esattamente la finestra che si stava
 * guardando. Serve perché dopo una modifica una riga può non soddisfare più
 * i filtri attivi (si sospende un utente mentre si filtra per «attivi»), e
 * una appena creata potrebbe non rientrarci affatto: ritoccare la lista in
 * memoria vorrebbe dire riscrivere qui la regola del filtro. */

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { CreateUserPayload, UpdateUserPayload, UserFilters } from '../services/admin'
import {
  fetchUsers,
  createNewUser,
  updateUser,
  deleteUser,
  setUserStatus,
  resendUserCredentials,
} from '../services/admin'
import type { UserStatus } from '../services/auth'
import { queryKeys } from './queryKeys'

/** Righe caricate per volta. */
export const USERS_WINDOW_SIZE = 200

/* Un account cambia di rado, e le proprie modifiche le copre già
 * l'invalidazione qui sotto: al ritorno sulla scheda si rilegge per vedere
 * cosa hanno fatto gli altri, cosa che due minuti di ritardo non rendono meno
 * utile. Conta anche che rileggere significa rileggere tutte le pagine che
 * "carica altri" ha aggiunto. */
const USERS_STALE_TIME = 1000 * 60 * 2

/** I filtri che entrano nella chiave di cache, senza la paginazione. */
export type AdminUserFilters = Omit<UserFilters, 'limit' | 'offset'>

export function useAdminUsers(filters: AdminUserFilters, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: ({ pageParam }) =>
      fetchUsers({ ...filters, limit: USERS_WINDOW_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled,
    staleTime: USERS_STALE_TIME,
    /* Cambiare un filtro o scrivere nella ricerca è una chiave di cache
     * nuova, cioè una query che non ha ancora dati: senza questo, la tabella
     * spariva e al suo posto compariva il riquadro di caricamento, e la
     * pagina saltava a ogni tasto premuto. Con le righe di prima al loro
     * posto (`isPlaceholderData` dice che sono quelle vecchie, e la pagina le
     * attenua) resta solo il tempo di attesa, senza il salto. */
    placeholderData: keepPreviousData,
  })

  const pages = query.data?.pages ?? []
  return {
    ...query,
    users: pages.flatMap((page) => page.items),
    total: pages.at(-1)?.total ?? 0,
  }
}

/** Ogni scrittura su un account rilegge l'elenco, per la ragione spiegata
 *  in cima al file. */
function useInvalidateUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => createNewUser(payload),
    onSuccess: invalidate,
  })
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UpdateUserPayload }) =>
      updateUser(userId, payload),
    onSuccess: invalidate,
  })
}

/** Sospende, riattiva o disabilita. Qualunque stato diverso da «attivo»
 *  blocca il login e chiude subito le sessioni aperte. */
export function useSetUserStatus() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      setUserStatus(userId, status),
    onSuccess: invalidate,
  })
}

/** Manda una nuova password temporanea via email. L'elenco si rilegge perché
 *  reinvitare un account può cambiargli il `cognito_sub`. */
export function useResendUserCredentials() {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (userId: string) => resendUserCredentials(userId),
    onSuccess: invalidate,
  })
}

/** Elimina l'utente da Cognito e dal database, con le sue conversazioni:
 *  vanno quindi via anche i report e le liste che le contavano. */
export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
