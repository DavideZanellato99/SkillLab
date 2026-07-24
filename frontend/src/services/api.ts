/* API service for communicating with the FastAPI backend */

import { refreshSession } from './auth';

// Empty base URL: requests are same-origin and the Vite dev server proxies
// /api and /static to the backend (see vite.config.ts). This lets the app
// work through tunnels (cloudflared) without touching CORS.
const API_BASE_URL = '';

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

/** Channel a conversation runs on, fixed when it is opened. */
export type ConversationMode = 'voice' | 'text';

export interface ChatConversation {
  id: string;
  avatar_id: string;
  /** Always set: defaults to "<Category> <n>" and can be renamed, never blank. */
  title: string;
  /** "voice" for a phone call, "text" for a written chat. */
  mode: ConversationMode;
  /** Set when the conversation ended: the transcript is read-only and cannot be resumed. */
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

/**
 * One transcript message cited by the AI judge as evidence for a criterion.
 * `index` is the 1-based position in the evaluated transcript; `message_id`
 * anchors it to the stored message when one exists.
 */
export interface EvaluationCitation {
  index: number;
  message_id: string | null;
}

export interface EvaluationCriterion {
  key: string;
  label: string;
  score: number;
  comment: string;
  /** Improvement suggestions, present only when score < 8. */
  suggestions: string | null;
  /** Messages the judgment rests on; empty for evaluations stored before citations existed. */
  citations?: EvaluationCitation[];
}

/**
 * The user's previous evaluated attempt at the same scenario (same avatar,
 * closest earlier conversation with an evaluation): the baseline the
 * current evaluation is compared against.
 */
export interface PreviousAttempt {
  conversation_id: string;
  title: string;
  mode: ConversationMode;
  conversation_at: string;
  overall_score: number;
  /** Criterion key -> score of the previous attempt. */
  criteria_scores: Record<string, number>;
}

export interface ConversationEvaluation {
  id: string;
  conversation_id: string;
  overall_score: number;
  summary: string;
  criteria: EvaluationCriterion[];
  /** Null on the first evaluated attempt at this scenario. */
  previous?: PreviousAttempt | null;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationSummary {
  id: string;
  avatar_id: string;
  /** Always set: defaults to "<Category> <n>" and can be renamed, never blank. */
  title: string;
  /** "voice" for a phone call, "text" for a written chat. */
  mode: ConversationMode;
  /** Set when the conversation ended: the transcript is read-only and cannot be resumed. */
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string | null;
}

/** One completed chat round trip: the operator's message and the avatar's reply. */
export interface ChatMessageExchange {
  conversation_id: string;
  title: string;
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
 * Performs the request and returns the raw Response, already past the auth
 * retry and the error check. Callers decode the body themselves: most want
 * JSON (apiFetch), audio downloads want a Blob (apiFetchBlob).
 */
async function apiRequest(endpoint: string, options: ApiFetchOptions = {}): Promise<Response> {
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

  // A Blob body travels as-is (audio uploads): fetch derives its
  // Content-Type from blob.type, so serializing it would corrupt it.
  const isRawBody = body instanceof Blob;
  const requestHeaders: Record<string, string> = { ...(headers as Record<string, string>) };
  if (body !== undefined && !isRawBody) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const doFetch = () =>
    fetch(url, {
      ...rest,
      credentials: 'include',
      headers: requestHeaders,
      body: body === undefined ? undefined : isRawBody ? (body as Blob) : JSON.stringify(body),
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

  return response;
}

/**
 * Unified fetch wrapper used by every API call.
 * Handles JSON serialization, query params, error extraction and base URL.
 * Auth travels in HttpOnly cookies (credentials: 'include'); on 401 the
 * session is refreshed via cookie and the request retried once.
 */
export async function apiFetch<T>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const response = await apiRequest(endpoint, options);
  return response.json() as Promise<T>;
}

/**
 * Same wrapper for binary responses (call recordings). The whole body is
 * buffered, which suits files of a few MB: seeking inside the returned
 * Blob is instant, at the cost of no progressive playback.
 */
export async function apiFetchBlob(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<Blob> {
  const response = await apiRequest(endpoint, options);
  return response.blob();
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

/** Rename a conversation; the title is mandatory, a blank one is rejected. */
export const renameConversation = (conversationId: string, title: string) =>
  apiFetch<ChatConversationSummary>(`/api/chat/conversation/${conversationId}`, {
    method: 'PATCH',
    body: { title },
  });

/**
 * Send one operator message in a text chat and stream the avatar's reply.
 *
 * The endpoint answers in Server-Sent Events over the POST response (an
 * EventSource cannot POST, so the stream is read by hand): `onDelta`
 * receives each text fragment as the model produces it, and the promise
 * resolves with the persisted exchange once the backend has stored both
 * sides. Errors mid-stream reject the promise and nothing was persisted,
 * so resending is always safe. Without a conversationId a new text
 * conversation is opened, so the operator writes first just as they speak
 * first on a call.
 */
export async function sendChatMessage(
  avatarId: string,
  conversationId: string | null,
  content: string,
  onDelta: (text: string) => void,
): Promise<ChatMessageExchange> {
  const response = await apiRequest('/api/chat/message', {
    method: 'POST',
    body: { avatar_id: avatarId, conversation_id: conversationId, content },
  });
  if (!response.body) {
    throw new Error('Questo browser non supporta le risposte in streaming.');
  }

  let exchange: ChatMessageExchange | null = null;

  // One "event: <name>\ndata: <json>" block per event, blank-line separated
  const handleEventBlock = (block: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const data: unknown = JSON.parse(dataLines.join('\n'));
    if (event === 'delta') {
      onDelta((data as { text: string }).text);
    } else if (event === 'done') {
      exchange = data as ChatMessageExchange;
    } else if (event === 'error') {
      throw new Error((data as { detail?: string }).detail ?? "Errore nella risposta dell'avatar.");
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator;
    while ((separator = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      if (block.trim()) handleEventBlock(block);
    }
  }

  // Connection dropped before the done event: the server persisted
  // nothing, so resending the message is safe
  if (!exchange) {
    throw new Error('Risposta interrotta: invia di nuovo il messaggio.');
  }
  return exchange;
}

/** Close a text chat: the transcript becomes final, like hanging up a call. */
export const endChatConversation = (conversationId: string) =>
  apiFetch<ChatConversationSummary>(`/api/chat/conversation/${conversationId}/end`, {
    method: 'POST',
  });

/* Deleting a conversation is admin-only and lives in services/admin.ts
 * (deleteAdminConversation): the chat router exposes no delete endpoint. */

/** Ask the AI trainer to judge the whole conversation (replaces any previous evaluation). */
export const evaluateConversation = (conversationId: string) =>
  apiFetch<ConversationEvaluation>(`/api/chat/conversation/${conversationId}/evaluate`, {
    method: 'POST',
  });

/** Fetch the stored evaluation for a conversation; null if none exists yet. */
export const fetchConversationEvaluation = (conversationId: string) =>
  apiFetch<ConversationEvaluation | null>(`/api/chat/conversation/${conversationId}/evaluation`);

/** The stored evaluation as a PDF to hand to the trainer (owner only). */
export const fetchEvaluationPdf = (conversationId: string) =>
  apiFetchBlob(`/api/chat/conversation/${conversationId}/evaluation/pdf`);

/** Hand a fetched file to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// =====================================================
//  UTILS
// =====================================================

export function getAvatarImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return `${API_BASE_URL}${imageUrl}`;
}
