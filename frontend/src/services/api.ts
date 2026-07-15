/* API service for communicating with the FastAPI backend */

const API_BASE_URL = 'http://localhost:8000';

// =====================================================
//  TYPES
// =====================================================

export interface Avatar {
  id: number;
  name: string;
  image_url: string;
  category: string;
  description: string | null;
  created_at: string;
  selection_count: number;
}

export interface UserSelection {
  id: number;
  avatar_id: number;
  selected_at: string;
  avatar: Avatar;
}

export interface MessageResponse {
  message: string;
  success: boolean;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ChatConversation {
  id: number;
  avatar_id: number;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatConversationSummary {
  id: number;
  avatar_id: number;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

export interface ChatSendResponse {
  conversation_id: number;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
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
 * Handles JSON serialization, query params, error extraction, and base URL.
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

  // Build headers
  const requestHeaders: HeadersInit = { ...headers };
  if (body !== undefined) {
    (requestHeaders as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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

export const fetchAvatar = (avatarId: number) =>
  apiFetch<Avatar>(`/api/avatars/${avatarId}`);

export const fetchCategories = () =>
  apiFetch<string[]>('/api/avatars/categories');

export const selectAvatar = (avatarId: number) =>
  apiFetch<MessageResponse>('/api/avatars/select', {
    method: 'POST',
    body: { avatar_id: avatarId },
  });

// --- Chat ---

export const fetchConversations = (avatarId: number) =>
  apiFetch<ChatConversationSummary[]>(`/api/chat/avatar/${avatarId}/conversations`);

export const fetchConversation = (conversationId: number) =>
  apiFetch<ChatConversation>(`/api/chat/conversation/${conversationId}`);

export const sendChatMessage = (
  avatarId: number,
  content: string,
  conversationId?: number | null,
) =>
  apiFetch<ChatSendResponse>(`/api/chat/avatar/${avatarId}/send`, {
    method: 'POST',
    body: { content, conversation_id: conversationId ?? null },
  });

export const deleteConversation = (conversationId: number) =>
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
