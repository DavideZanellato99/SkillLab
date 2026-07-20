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
