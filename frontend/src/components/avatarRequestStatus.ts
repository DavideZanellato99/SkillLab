/* Come si chiama e di che colore è lo stato di una richiesta di avatar.
 *
 * Lo leggono due schermate, la galleria di chi ha chiesto e la gestione
 * avatar di chi evade, e la stessa richiesta deve avere lo stesso nome e la
 * stessa tinta in entrambe. */

import type { AvatarRequestStatus } from '../services/avatarRequests'

export const AVATAR_REQUEST_STATUS_LABELS: Record<AvatarRequestStatus, string> = {
  pending: 'In attesa',
  published: 'Pubblicata',
  rejected: 'Rifiutata',
}

export const AVATAR_REQUEST_STATUS_CLASSES: Record<AvatarRequestStatus, string> = {
  pending: 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
  published: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  rejected: 'border border-red-500/30 bg-red-500/10 text-red-400',
}
