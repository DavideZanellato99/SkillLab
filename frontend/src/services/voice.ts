/* Voice session API service (ElevenLabs STT + OpenAI + Cartesia TTS) */

import { apiFetch, apiFetchBlob } from './api';
import type { CallRecording } from './voiceCall';

export interface VoiceSession {
  session_id: string;
  conversation_id: string;
}

/** Metadata of a stored call recording, without the audio itself. */
export interface VoiceRecordingInfo {
  conversation_id: string;
  mime_type: string;
  /** Measured at record time: the WebM container carries no duration. */
  duration_ms: number | null;
  size_bytes: number;
  created_at: string;
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

/**
 * Store the mixed audio of a call (operator + avatar in one track), posted
 * on hang-up. Re-uploading for the same conversation replaces the previous
 * recording, so a retry never leaves two half files behind.
 */
export const uploadRecording = (conversationId: string, recording: CallRecording) =>
  apiFetch<VoiceRecordingInfo>(`/api/voice/recording/${conversationId}`, {
    method: 'POST',
    params: { duration_ms: String(recording.durationMs) },
    body: recording.blob,
  });

/** Metadata of a conversation's recording; null when it has none. */
export const fetchRecordingInfo = (conversationId: string) =>
  apiFetch<VoiceRecordingInfo | null>(`/api/voice/recording/${conversationId}/info`);

/** The audio itself, for an <audio> element via URL.createObjectURL. */
export const fetchRecordingBlob = (conversationId: string) =>
  apiFetchBlob(`/api/voice/recording/${conversationId}`);

/* Come the citation chips of the evaluation, a cited call message must be
 * heard, not only read. The recording has no per-message markers, so the
 * moment is estimated from the timestamps: the recording ends when its row
 * is written (upload happens on hang-up), so it starts about created_at
 * minus duration. A message's created_at lands near the END of the spoken
 * turn (STT commit for the operator, LLM completion for the avatar), so a
 * fixed rewind puts the start of the cited utterance back into earshot. */
const CITATION_REWIND_MS = 8000;

/**
 * Estimated position (ms) in the recording where the cited message can be
 * heard, or null when the recording carries no measured duration.
 */
export function estimateCitationSeekMs(
  info: VoiceRecordingInfo,
  messageCreatedAt: string,
): number | null {
  if (info.duration_ms === null) return null;
  const recordingStart = new Date(info.created_at).getTime() - info.duration_ms;
  const offset = new Date(messageCreatedAt).getTime() - recordingStart;
  return Math.max(0, Math.min(offset - CITATION_REWIND_MS, info.duration_ms));
}
