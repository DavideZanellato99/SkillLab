/* API service for communicating with the FastAPI backend */

import { refreshSession } from './auth';

const API_BASE_URL = 'http://localhost:8000';

// =====================================================
//  TYPES
// =====================================================

export interface Avatar {
  id: string;
  name: string;
  image_url: string;
  category: string;
  description: string | null;
  created_at: string;
  selection_count: number;
  /** Difficulty grade of the training persona (e.g. "8/10"), if any. */
  difficulty: string | null;
}

export interface UserSelection {
  id: string;
  avatar_id: string;
  selected_at: string;
  avatar: Avatar;
}

export interface MessageResponse {
  message: string;
  success: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  avatar_id: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface EvaluationCriterion {
  key: string;
  label: string;
  score: number;
  comment: string;
  /** Improvement suggestions, present only when score < 7. */
  suggestions: string | null;
}

export interface ConversationEvaluation {
  id: string;
  conversation_id: string;
  overall_score: number;
  summary: string;
  criteria: EvaluationCriterion[];
  created_at: string;
  updated_at: string;
}

export interface ChatConversationSummary {
  id: string;
  avatar_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

// =====================================================
//  UNIFIED API CLIENT
// =====================================================

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

/**
 * Unified fetch wrapper used by every API call.
 * Handles JSON serialization, query params, error extraction and base URL.
 * Auth travels in HttpOnly cookies (credentials: 'include'); on 401 the
 * session is refreshed via cookie and the request retried once.
 */
export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, params, headers, ...rest } = options;

  // Build URL with optional query params
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
    );
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const requestHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const doFetch = () =>
    fetch(url, {
      ...rest,
      credentials: 'include',
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await doFetch();

  // Handle 401 — rotate the access token cookie once and retry
  if (response.status === 401) {
    if (await refreshSession()) {
      response = await doFetch();
    }
    if (response.status === 401) {
      // Session is gone — reload so the app falls back to the login screen
      window.location.reload();
      throw new Error('Sessione scaduta. Effettua nuovamente il login.');
    }
  }

  if (!response.ok) {
    // Try to extract a detail message from the JSON error body
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.detail ?? errorBody?.message ?? response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// =====================================================
//  API FUNCTIONS (thin wrappers around apiFetch)
// =====================================================

// --- Avatars ---

export const fetchAvatars = (category?: string) =>
  apiFetch<Avatar[]>('/api/avatars', {
    params: category ? { category } : undefined,
  });

export const fetchAvatar = (avatarId: string) =>
  apiFetch<Avatar>(`/api/avatars/${avatarId}`);

export const fetchCategories = () =>
  apiFetch<string[]>('/api/avatars/categories');

export const selectAvatar = (avatarId: string) =>
  apiFetch<MessageResponse>('/api/avatars/select', {
    method: 'POST',
    body: { avatar_id: avatarId },
  });

// --- Chat history (voice conversation transcripts) ---

export const fetchConversations = (avatarId: string) =>
  apiFetch<ChatConversationSummary[]>(`/api/chat/avatar/${avatarId}/conversations`);

export const fetchConversation = (conversationId: string) =>
  apiFetch<ChatConversation>(`/api/chat/conversation/${conversationId}`);

export const deleteConversation = (conversationId: string) =>
  apiFetch<MessageResponse>(`/api/chat/conversation/${conversationId}`, {
    method: 'DELETE',
  });

/** Ask the AI trainer to judge the whole conversation (replaces any previous evaluation). */
export const evaluateConversation = (conversationId: string) =>
  apiFetch<ConversationEvaluation>(`/api/chat/conversation/${conversationId}/evaluate`, {
    method: 'POST',
  });

/** Fetch the stored evaluation for a conversation; null if none exists yet. */
export const fetchConversationEvaluation = (conversationId: string) =>
  apiFetch<ConversationEvaluation | null>(`/api/chat/conversation/${conversationId}/evaluation`);

// =====================================================
//  UTILS
// =====================================================

export function getAvatarImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return `${API_BASE_URL}${imageUrl}`;
}
