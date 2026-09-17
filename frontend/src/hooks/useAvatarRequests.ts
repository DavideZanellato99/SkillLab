/* Le richieste di avatar, con le loro scritture.
 *
 * Ogni scrittura invalida l'elenco delle richieste e la campanella: una
 * richiesta mandata compare nella campanella del super admin, una rifiutata
 * in quella di chi l'ha mandata, e aspettare il prossimo giro di polling
 * vorrebbe dire vedere il contatore vecchio per due minuti. La pubblicazione
 * passa da `useCreateAvatar`, che invalida il ramo degli avatar: qui basta
 * che invalidi anche questo. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AvatarRequestFilters, AvatarRequestPayload } from '../services/avatarRequests'
import {
  createAvatarRequest,
  deleteAvatarRequest,
  fetchAvatarRequests,
  rejectAvatarRequest,
} from '../services/avatarRequests'
import { queryKeys } from './queryKeys'

export function useAvatarRequests(filters: AvatarRequestFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.avatarRequests.list(filters),
    queryFn: () => fetchAvatarRequests(filters),
    enabled,
  })
}

export function useInvalidateAvatarRequests() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.avatarRequests.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  }
}

export function useCreateAvatarRequest() {
  const invalidate = useInvalidateAvatarRequests()
  return useMutation({
    mutationFn: (payload: AvatarRequestPayload) => createAvatarRequest(payload),
    onSuccess: invalidate,
  })
}

export function useRejectAvatarRequest() {
  const invalidate = useInvalidateAvatarRequests()
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      rejectAvatarRequest(requestId, reason),
    onSuccess: invalidate,
  })
}

export function useDeleteAvatarRequest() {
  const invalidate = useInvalidateAvatarRequests()
  return useMutation({
    mutationFn: (requestId: string) => deleteAvatarRequest(requestId),
    onSuccess: invalidate,
  })
}
