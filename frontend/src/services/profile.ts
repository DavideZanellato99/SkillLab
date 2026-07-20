/* Self-service profile API — the authenticated user's own data:
   view profile, edit first/last name (email is read-only) and change
   password. Available to every role, unlike services/admin.ts. */
import { apiFetch } from './api';
import type { AuthUser } from './auth';

export interface UpdateProfilePayload {
  nome?: string;
  cognome?: string;
}

/** Update the current user's own first/last name. Email and role are read-only here. */
export const updateMyProfile = (payload: UpdateProfilePayload) =>
  apiFetch<AuthUser>('/api/auth/me', {
    method: 'PUT',
    body: payload,
  });

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

/** Change the current user's own password; Cognito verifies the current password server-side. */
export const changeMyPassword = (payload: ChangePasswordPayload) =>
  apiFetch<{ message: string; success: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: payload,
  });
