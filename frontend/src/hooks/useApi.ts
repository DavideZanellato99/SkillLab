/**
 * TanStack Query hooks for all API calls.
 *
 * Every hook wraps the thin functions from `api.ts` and provides
 * standardised caching, refetching, and mutation + invalidation logic.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAvatars,
  fetchAvatar,
  fetchCategories,
  fetchConversations,
  fetchConversation,
  sendChatMessage,
  deleteConversation,
} from '../services/api';
import type { ChatSendResponse } from '../services/api';

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

// =====================================================
//  CHAT MUTATIONS
// =====================================================

interface SendMessageVars {
  avatarId: string;
  content: string;
  conversationId?: string | null;
}

/** Send a chat message and receive the AI response. */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatSendResponse, Error, SendMessageVars>({
    mutationFn: ({ avatarId, content, conversationId }) =>
      sendChatMessage(avatarId, content, conversationId),

    onSuccess: (_data, variables) => {
      // Invalidate conversations list so sidebar updates
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.byAvatar(variables.avatarId),
      });
    },
  });
}

/** Delete a conversation. */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId: string) => deleteConversation(conversationId),

    onSuccess: () => {
      // Invalidate all conversation lists
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
