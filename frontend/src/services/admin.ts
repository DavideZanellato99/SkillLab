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

// ── Avatar CRUD (super admin only) ───────────────────

export interface AdminAvatar {
  id: string;
  name: string;
  image_url: string;
  category: string;
  description: string | null;
  voice_id: string | null;
  difficulty: string | null;
  profile: Record<string, string>;
  created_at: string;
  conversation_count: number;
}

export interface AdminAvatarPayload {
  category: string;
  description: string | null;
  image_url: string | null;
  voice_id: string | null;
  profile: Record<string, string>;
}

/** List all avatars with their full persona sheet (Super Admin only). */
export const fetchAdminAvatars = () =>
  apiFetch<AdminAvatar[]>('/api/admin/avatars');

/** Create a new avatar/persona (Super Admin only). */
export const createAvatar = (payload: AdminAvatarPayload) =>
  apiFetch<AdminAvatar>('/api/admin/avatars', {
    method: 'POST',
    body: payload,
  });

/** Update an avatar/persona (Super Admin only). */
export const updateAvatar = (avatarId: string, payload: AdminAvatarPayload) =>
  apiFetch<AdminAvatar>(`/api/admin/avatars/${avatarId}`, {
    method: 'PUT',
    body: payload,
  });

/** Delete an avatar with its conversations and selections (Super Admin only). */
export const deleteAvatar = (avatarId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/avatars/${avatarId}`, {
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

// ── Evaluations dashboard (read-only) ────────────────

export interface EvaluationCriterionScore {
  key: string;
  label: string;
  score: number;
}

export interface EvaluationReportRow {
  conversation_id: string;
  user_id: string;
  user_email: string;
  user_nome: string;
  user_cognome: string;
  avatar_id: string;
  avatar_name: string;
  conversation_at: string;
  evaluated_at: string;
  overall_score: number;
  criteria: EvaluationCriterionScore[];
}

/**
 * Fetch every evaluated conversation with its scores — the data source for
 * the dashboard charts (Super Admin + Organization Admin).
 */
export const fetchEvaluationsReport = () =>
  apiFetch<EvaluationReportRow[]>('/api/admin/evaluations-report');
