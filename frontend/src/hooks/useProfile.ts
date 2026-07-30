/* Le due scritture che un utente fa sul proprio account: nome e cognome, e
 * la password.
 *
 * Non c'è una query corrispondente: il profilo di chi sta guardando vive nel
 * contesto di autenticazione, che è la sessione, non una voce di cache. Per
 * questo `useUpdateMyProfile` non invalida niente e restituisce l'utente
 * aggiornato: è il contesto che va allineato, e lo fa chi chiama.
 *
 * L'esportazione dei propri dati (GDPR) resta fuori: produce uno ZIP da
 * salvare su disco. */

import { useMutation } from '@tanstack/react-query'
import type { ChangePasswordPayload, UpdateProfilePayload } from '../services/profile'
import { changeMyPassword, updateMyProfile } from '../services/profile'

export function useUpdateMyProfile() {
  return useMutation({
    mutationFn: (payload: UpdateProfilePayload) => updateMyProfile(payload),
  })
}

/** La password attuale la verifica Cognito lato server. */
export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (payload: ChangePasswordPayload) => changeMyPassword(payload),
  })
}
