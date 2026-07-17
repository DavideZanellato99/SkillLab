/* Admin API service for managing users */
import { apiFetch } from './api';
import type { AuthUser, RoleName } from './auth';

export interface CreateUserPayload {
  email: string;
  nome: string;
  cognome: string;
  ruolo: RoleName;
}

/**
 * Fetch all registered users in the system (Admin only).
 */
export const fetchAllUsers = () =>
  apiFetch<AuthUser[]>('/api/admin/users');

/**
 * Create a new user in Cognito and local DB (Super Admin only).
 */
export const createNewUser = (payload: { email: string; nome: string; cognome: string; ruolo: string }) =>
  apiFetch<AuthUser>('/api/admin/users', {
    method: 'POST',
    body: payload,
  });

export interface UpdateUserPayload {
  nome?: string;
  cognome?: string;
  ruolo?: RoleName;
}

/**
 * Update a user's fields and/or role (Super Admin only).
 */
export const updateUser = (userId: string, payload: UpdateUserPayload) =>
  apiFetch<AuthUser>(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: payload,
  });

/**
 * Delete a user from Cognito and the local DB (Super Admin only).
 */
export const deleteUser = (userId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });

// ── Activity report (read-only) ──────────────────────

export interface ConversationReport {
  id: string;
  avatar_id: string;
  avatar_name: string;
  avatar_category: string;
  created_at: string;
  message_count: number;
  duration_seconds: number;
}

export interface UserActivityReport {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  ruolo: string;
  created_at: string;
  conversation_count: number;
  total_duration_seconds: number;
  conversations: ConversationReport[];
}

/**
 * Fetch the read-only users activity recap: conversations per avatar and
 * durations (Super Admin + Organization Admin).
 */
export const fetchUsersReport = () =>
  apiFetch<UserActivityReport[]>('/api/admin/users-report');
