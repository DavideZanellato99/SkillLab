/* API service for communicating with the FastAPI backend */

import { getAccessToken, refreshAccessToken, clearAuthData } from './auth';

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
 * Handles JSON serialization, query params, error extraction, base URL,
 * and automatic Bearer token injection + 401 refresh.
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

  // Build headers — inject Authorization if token exists
  const requestHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  const token = getAccessToken();
  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — try to refresh the token once
  if (response.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      requestHeaders['Authorization'] = `Bearer ${newToken}`;
      const retryResponse = await fetch(url, {
        ...rest,
        headers: requestHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (retryResponse.ok) {
        return retryResponse.json() as Promise<T>;
      }
    }

    // Refresh failed — clear auth and throw
    clearAuthData();
    window.location.reload();
    throw new Error('Sessione scaduta. Effettua nuovamente il login.');
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

// =====================================================
//  UTILS
// =====================================================

export function getAvatarImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return `${API_BASE_URL}${imageUrl}`;
}
