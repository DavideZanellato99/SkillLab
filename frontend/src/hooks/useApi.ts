/**
 * TanStack Query hooks for all API calls.
 *
 * Every hook wraps the thin functions from `api.ts` and provides
 * standardised caching, refetching, and mutation + invalidation logic.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChatConversation, ChatConversationSummary } from '../services/api';
import {
  fetchAvatars,
  fetchAvatar,
  fetchCategories,
  fetchConversations,
  fetchConversation,
  renameConversation,
  sendChatMessage,
  endChatConversation,
  evaluateConversation,
  fetchConversationEvaluation,
} from '../services/api';
import { deleteAdminConversation } from '../services/admin';

// =====================================================
//  QUERY KEY FACTORY — single source of truth for keys
// =====================================================

export const queryKeys = {
  avatars: {
    all: ['avatars'] as const,
    list: (category?: string) => ['avatars', 'list', category ?? '__all__'] as const,
    detail: (id: string) => ['avatars', 'detail', id] as const,
  },
  categories: ['categories'] as const,
  conversations: {
    byAvatar: (avatarId: string) => ['conversations', 'avatar', avatarId] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
  },
  evaluations: {
    byConversation: (conversationId: string) =>
      ['evaluations', 'conversation', conversationId] as const,
  },
} as const;

// =====================================================
//  AVATAR QUERIES
// =====================================================

/** Fetch all avatars, optionally filtered by category. */
export function useAvatars(category?: string | null) {
  return useQuery({
    queryKey: queryKeys.avatars.list(category ?? undefined),
    queryFn: () => fetchAvatars(category ?? undefined),
  });
}

/** Fetch a single avatar by ID. */
export function useAvatar(avatarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.avatars.detail(avatarId!),
    queryFn: () => fetchAvatar(avatarId!),
    enabled: avatarId !== undefined,
  });
}

/** Fetch all distinct avatar categories. */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategories,
  });
}

// =====================================================
//  CHAT QUERIES
// =====================================================

/** Fetch all conversations for a given avatar. */
export function useConversations(avatarId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversations.byAvatar(avatarId!),
    queryFn: () => fetchConversations(avatarId!),
    enabled: avatarId !== undefined,
  });
}

/** Fetch a single conversation with all its messages. */
export function useConversation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId!),
    queryFn: () => fetchConversation(conversationId!),
    enabled: conversationId !== null,
  });
}

/** Fetch the stored AI evaluation of a conversation (null when none exists). */
export function useConversationEvaluation(conversationId: string | null) {
  return useQuery({
    queryKey: queryKeys.evaluations.byConversation(conversationId!),
    queryFn: () => fetchConversationEvaluation(conversationId!),
    enabled: conversationId !== null,
  });
}

// =====================================================
//  CHAT MUTATIONS
// =====================================================

/** Run the AI evaluation of a conversation and cache the result. */
export function useEvaluateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => evaluateConversation(conversationId),

    onSuccess: (data, conversationId) => {
      queryClient.setQueryData(queryKeys.evaluations.byConversation(conversationId), data);
    },
  });
}

/**
 * Send one operator message in a text chat and stream the avatar's reply:
 * `onDelta` receives the text fragments as they arrive, the mutation
 * resolves with the persisted exchange when the stream is over.
 *
 * The conversation list is invalidated on success: the exchange bumps the
 * message count and the preview, and the very first message also creates
 * the conversation the list does not know about yet.
 */
export function useSendChatMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      avatarId,
      conversationId,
      content,
      onDelta,
    }: {
      avatarId: string;
      conversationId: string | null;
      content: string;
      onDelta: (text: string) => void;
    }) => sendChatMessage(avatarId, conversationId, content, onDelta),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/** Close a text chat: the transcript becomes final and cannot be resumed. */
export function useEndChatConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => endChatConversation(conversationId),

    // Patch the caches with the returned summary instead of refetching, so
    // ended_at is known at once and the dock stops offering to write more.
    onSuccess: (updated) => {
      queryClient.setQueryData<ChatConversationSummary[]>(
        queryKeys.conversations.byAvatar(updated.avatar_id),
        (list) => list?.map((conv) => (conv.id === updated.id ? { ...conv, ...updated } : conv)),
      );
      queryClient.setQueryData<ChatConversation>(
        queryKeys.conversations.detail(updated.id),
        (conv) => (conv ? { ...conv, ended_at: updated.ended_at } : conv),
      );
    },
  });
}

/** Rename a conversation; the title is mandatory, a blank one is rejected. */
export function useRenameConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ conversationId, title }: { conversationId: string; title: string }) =>
      renameConversation(conversationId, title),

    // Patch the cached copies instead of refetching: the response already
    // carries the updated summary. It also carries ended_at, which the
    // caches can still be missing when the rename follows a hang-up.
    onSuccess: (updated) => {
      queryClient.setQueryData<ChatConversationSummary[]>(
        queryKeys.conversations.byAvatar(updated.avatar_id),
        (list) => list?.map((conv) => (conv.id === updated.id ? { ...conv, ...updated } : conv)),
      );
      queryClient.setQueryData<ChatConversation>(
        queryKeys.conversations.detail(updated.id),
        (conv) =>
          conv ? { ...conv, title: updated.title, ended_at: updated.ended_at } : conv,
      );
    },
  });
}

/** Delete a conversation. Admin-only: the backend has no endpoint for a
 *  normal user to delete their own history. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => deleteAdminConversation(conversationId),

    onSuccess: () => {
      // Invalidate all conversation lists
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
