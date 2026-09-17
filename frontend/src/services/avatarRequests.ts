/* Le richieste di avatar: un organization admin chiede un cliente nuovo per
 * la propria galleria, il super admin compila la scheda intera o rifiuta.
 *
 * Le due metà passano dallo stesso endpoint: chi amministra un tenant vede
 * le richieste del suo, il super admin tutte. La pubblicazione non sta qui,
 * è il salvataggio della scheda con `request_id` (vedi `createAvatar` in
 * admin.ts): un avatar nasce da una scheda compilata, non da un bottone. */

import { apiFetch } from './api'
import type { Authored } from './authorship'

export type AvatarRequestStatus = 'pending' | 'published' | 'rejected'

export interface AvatarRequest extends Authored {
  id: string
  organization_id: string
  organization_name: string
  /** Il nome scritto da chi ha chiesto, anche di una categoria che
   *  l'organizzazione non ha ancora. */
  category: string
  first_name: string
  last_name: string
  scenario_type: string
  problem: string
  status: AvatarRequestStatus
  /** L'avatar nato dalla richiesta, quando è pubblicata. */
  avatar_id: string | null
  rejection_reason: string | null
  resolved_at: string | null
}

export interface AvatarRequestPayload {
  first_name: string
  last_name: string
  category: string
  scenario_type: string
  problem: string
}

export interface AvatarRequestFilters {
  status?: AvatarRequestStatus
  /** Solo per il super admin: a un organization admin viene ignorato. */
  organizationId?: string
}

export const fetchAvatarRequests = (filters: AvatarRequestFilters = {}) =>
  apiFetch<AvatarRequest[]>('/api/avatar-requests', {
    params: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.organizationId ? { organization_id: filters.organizationId } : {}),
    },
  })

/** Chiedere un avatar per la propria organizzazione (organization admin). */
export const createAvatarRequest = (payload: AvatarRequestPayload) =>
  apiFetch<AvatarRequest>('/api/avatar-requests', { method: 'POST', body: payload })

/** Rifiutare una richiesta con un motivo (super admin). */
export const rejectAvatarRequest = (requestId: string, reason: string) =>
  apiFetch<AvatarRequest>(`/api/avatar-requests/${requestId}/reject`, {
    method: 'POST',
    body: { reason },
  })

/** Ritirare una richiesta in attesa o togliere di mezzo una rifiutata
 *  (organization admin, solo le proprie). */
export const deleteAvatarRequest = (requestId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/avatar-requests/${requestId}`, {
    method: 'DELETE',
  })
