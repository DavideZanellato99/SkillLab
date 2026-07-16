/* Voice session API service (Hume EVI integration) */

import { apiFetch } from './api';

export interface VoiceSession {
  access_token: string;
  config_id: string;
  custom_session_id: string;
  conversation_id: string;
  voice_id: string | null;
}

/**
 * Start a voice session for an avatar. The backend creates/reuses the
 * conversation, registers the session for the CLM endpoint and returns
 * the Hume credentials needed to open the EVI WebSocket.
 */
export const startVoiceSession = (avatarId: string, conversationId?: string | null) =>
  apiFetch<VoiceSession>('/api/voice/session', {
    method: 'POST',
    body: { avatar_id: avatarId, conversation_id: conversationId ?? null },
  });
