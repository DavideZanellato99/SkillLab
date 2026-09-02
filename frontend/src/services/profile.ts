/* Self-service profile API — the authenticated user's own data:
   view profile, edit first/last name (email is read-only) and change
   password. Available to every role, unlike services/admin.ts. */
import { apiFetch, apiFetchBlob } from './api'
import type { AuthUser } from './auth'

export interface UpdateProfilePayload {
  nome?: string
  cognome?: string
}

/** Update the current user's own first/last name. Email and role are read-only here. */
export const updateMyProfile = (payload: UpdateProfilePayload) =>
  apiFetch<AuthUser>('/api/auth/me', {
    method: 'PUT',
    body: payload,
  })

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

/** Change the current user's own password; Cognito verifies the current password server-side. */
export const changeMyPassword = (payload: ChangePasswordPayload) =>
  apiFetch<{ message: string; success: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: payload,
  })

/* La guida introduttiva è stata vista: da qui in poi non compare più da
   sola. Non prende parametri e non ha un gemello che la rimette in piedi,
   perché riaprirla dal proprio profilo non cambia niente sul server. */
export const markTutorialSeen = () =>
  apiFetch<AuthUser>('/api/auth/me/tutorial', { method: 'POST' })

/* Copia dei propri dati personali (GDPR art. 15 e 20): uno ZIP con il JSON
   strutturato, le registrazioni audio delle proprie chiamate e un LEGGIMI.
   Riguarda sempre e solo chi chiama, l'utente lo prende il server dalla
   sessione. */
export const fetchMyDataExport = () => apiFetchBlob('/api/auth/me/export')
