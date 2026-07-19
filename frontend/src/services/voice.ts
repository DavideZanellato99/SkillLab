/* Voice session API service (ElevenLabs STT + OpenAI + Cartesia TTS) */

import { apiFetch } from './api';

export interface VoiceSession {
  session_id: string;
  conversation_id: string;
}

/**
 * Start a voice session for an avatar. The backend creates/reuses the
 * conversation, registers the session for the voice WebSocket and returns
 * the unguessable session id used to open it.
 *
 * The session simulates the avatar phoning the bank's toll-free number:
 * after the ring the avatar waits in silence for the operator (the user)
 * to answer and introduce themselves, then it states why it is calling.
 */
export const startVoiceSession = (
  avatarId: string,
  conversationId?: string | null,
) =>
  apiFetch<VoiceSession>('/api/voice/session', {
    method: 'POST',
    body: { avatar_id: avatarId, conversation_id: conversationId ?? null },
  });
