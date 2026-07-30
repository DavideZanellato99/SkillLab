/* Le organizzazioni (i tenant), che solo il super admin vede.
 *
 * L'elenco serve a sette pagine: la sua, e poi come sorgente del filtro
 * «organizzazione» di utenti, avatar, registro, report, dashboard e
 * percorsi. Prima ognuna se lo rifetchava con un useEffect suo, quindi
 * passare da una pagina all'altra rifaceva la stessa richiesta ogni volta;
 * ora la chiave è una sola e la risposta è condivisa.
 *
 * Il tempo di vita è più lungo del minuto di default: un tenant si crea o si
 * sospende raramente, e chi lo fa passa dalle mutation qui sotto, che
 * invalidano la cache. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Organization, OrgStatus } from '../services/organizations'
import {
  fetchOrganizations,
  fetchOrganization,
  createOrganization,
  updateOrganization,
  setOrganizationStatus,
  deleteOrganization,
} from '../services/organizations'
import { queryKeys } from './queryKeys'

/** Quanto l'elenco resta valido senza rileggerlo: i tenant cambiano di rado. */
const ORGANIZATIONS_STALE_TIME = 1000 * 60 * 5

/**
 * Tutte le organizzazioni con i loro conteggi.
 *
 * `enabled` esiste perché le pagine che la usano come filtro la chiedono
 * solo quando chi guarda è super admin: per tutti gli altri il backend
 * risponderebbe 403, e il filtro non esiste nemmeno.
 */
export function useOrganizations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.organizations.list,
    queryFn: fetchOrganizations,
    enabled,
    staleTime: ORGANIZATIONS_STALE_TIME,
  })
}

/** Una sola organizzazione con le statistiche di utilizzo, che costano una
 *  scansione delle conversazioni del tenant e quindi arrivano a parte. Per lo
 *  stesso motivo restano valide due minuti: sono conteggi su finestre di
 *  trenta giorni, non numeri che si guardano cambiare. */
export function useOrganization(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.organizations.detail(organizationId!),
    queryFn: () => fetchOrganization(organizationId!),
    enabled: organizationId !== null,
    staleTime: 1000 * 60 * 2,
  })
}

/* Le mutation invalidano l'elenco invece di ritoccarlo: `user_count` e
 * `avatar_count` sono conteggi calcolati dal server, e ricostruirli qui
 * significherebbe riscrivere quel calcolo lato client. */
function useInvalidateOrganizations() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
}

export function useCreateOrganization() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: (payload: { name: string; slug?: string }) => createOrganization(payload),
    onSuccess: invalidate,
  })
}

export function useUpdateOrganization() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: ({
      organizationId,
      payload,
    }: {
      organizationId: string
      payload: { name?: string; slug?: string }
    }) => updateOrganization(organizationId, payload),
    onSuccess: invalidate,
  })
}

/** Sospende o riattiva. Il motivo viaggia con la sospensione ed è quello che
 *  leggono gli utenti bloccati; riattivando, il server lo cancella. */
export function useSetOrganizationStatus() {
  const invalidate = useInvalidateOrganizations()
  return useMutation({
    mutationFn: ({
      organizationId,
      status,
      reason,
    }: {
      organizationId: string
      status: OrgStatus
      reason?: string
    }) => setOrganizationStatus(organizationId, status, reason),
    onSuccess: invalidate,
  })
}

/**
 * Elimina un'organizzazione con tutti i suoi dati.
 *
 * Porta via utenti, avatar privati e conversazioni del tenant, quindi non
 * basta invalidare le organizzazioni: si azzera tutto quello che poteva
 * mostrarne le righe.
 */
export function useDeleteOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (organizationId: string) => deleteOrganization(organizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.avatars.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}

export type { Organization, OrgStatus }
