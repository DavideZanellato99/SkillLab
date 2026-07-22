/* Admin API service for managing users */
import { apiFetch } from './api';
import type { ChatMessage, ConversationEvaluation, ConversationMode } from './api';
import type { AuthUser, RoleName, UserStatus } from './auth';

export interface CreateUserPayload {
  email: string;
  nome: string;
  cognome: string;
  ruolo: RoleName;
  /** Required for user/organization_admin, null for super_admin. */
  organization_id?: string | null;
}

/**
 * Fetch all registered users in the system (Super Admin only), optionally
 * filtered by organization.
 */
export const fetchAllUsers = (organizationId?: string) =>
  apiFetch<AuthUser[]>('/api/admin/users', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });

/**
 * Create a new user in Cognito and local DB (Super Admin only).
 */
export const createNewUser = (payload: CreateUserPayload) =>
  apiFetch<AuthUser>('/api/admin/users', {
    method: 'POST',
    body: payload,
  });

export interface UpdateUserPayload {
  nome?: string;
  cognome?: string;
  ruolo?: RoleName;
  organization_id?: string | null;
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

/**
 * Change an account's state (Super Admin only): 'suspended' is reversible,
 * 'disabled' is final. Any non-active state blocks login and kills the
 * user's open sessions immediately.
 */
export const setUserStatus = (userId: string, status: UserStatus) =>
  apiFetch<AuthUser>(`/api/admin/users/${userId}/status`, {
    method: 'PUT',
    body: { status },
  });

/**
 * Send the user a fresh temporary password via Cognito email (Super Admin
 * only). The old credentials stop working; on the next login the user must
 * set a new password.
 */
export const resendUserCredentials = (userId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/users/${userId}/resend-credentials`, {
    method: 'POST',
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
  /** Owning tenant, or null for a global persona shared with every org. */
  organization_id: string | null;
  organization_name: string | null;
  profile: Record<string, string>;
  created_at: string;
  conversation_count: number;
}

export interface AdminAvatarPayload {
  category: string;
  description: string | null;
  image_url: string | null;
  voice_id: string | null;
  /** null makes it a global persona; a tenant id makes it private. */
  organization_id: string | null;
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
  title: string;
  /** Channel it ran on: "voice" for a call, "text" for a chat. */
  mode: ConversationMode;
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
  organization_id: string | null;
  organization_name: string | null;
  created_at: string;
  conversation_count: number;
  total_duration_seconds: number;
  conversations: ConversationReport[];
}

/**
 * Fetch the read-only users activity recap: conversations per avatar and
 * durations (Super Admin + Organization Admin). The Super Admin may filter
 * by organization; the Organization Admin is always scoped to its own.
 */
export const fetchUsersReport = (organizationId?: string) =>
  apiFetch<UserActivityReport[]>('/api/admin/users-report', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });

// ── Evaluations dashboard (read-only) ────────────────

export interface EvaluationCriterionScore {
  key: string;
  label: string;
  score: number;
}

export interface EvaluationReportRow {
  conversation_id: string;
  conversation_title: string;
  /** Channel it ran on: "voice" for a call, "text" for a chat. */
  mode: ConversationMode;
  user_id: string;
  user_email: string;
  user_nome: string;
  user_cognome: string;
  organization_id: string | null;
  organization_name: string | null;
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
export interface AdminConversationDetail {
  conversation_id: string;
  messages: ChatMessage[];
  evaluation: ConversationEvaluation | null;
}

/**
 * Fetch the full transcript + stored evaluation of any conversation
 * (Super Admin + Organization Admin) — used by the dashboard detail modal.
 */
export const fetchAdminConversation = (conversationId: string) =>
  apiFetch<AdminConversationDetail>(`/api/admin/conversations/${conversationId}`);

/**
 * Delete any user's conversation together with its messages and evaluation
 * (Super Admin + Organization Admin only — a normal user cannot delete
 * their own conversations).
 */
export const deleteAdminConversation = (conversationId: string) =>
  apiFetch<{ message: string; success: boolean }>(`/api/admin/conversations/${conversationId}`, {
    method: 'DELETE',
  });

export const fetchEvaluationsReport = (organizationId?: string) =>
  apiFetch<EvaluationReportRow[]>('/api/admin/evaluations-report', {
    params: organizationId ? { organization_id: organizationId } : undefined,
  });
