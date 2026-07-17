import { useState, useEffect, useRef } from 'react';
import { useVoice } from '@humeai/voice-react';
import { startVoiceSession } from '../services/voice';
import type { ChatMessage } from '../services/api';

type VoiceUiState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

interface VoiceButtonProps {
  avatarId: string;
  conversationId: string | null;
  onConversationId: (id: string) => void;
  onTranscript: (msg: ChatMessage) => void;
  onError: (message: string) => void;
  onSessionEnd: () => void;
}

const STATE_LABELS: Record<VoiceUiState, string | null> = {
  idle: null,
  connecting: 'Connessione...',
  listening: 'In ascolto',
  processing: 'Sta elaborando...',
  speaking: 'Sta parlando...',
};

/* Status pill + blink dot styling per state */
const STATUS_CLASSES: Record<VoiceUiState, string> = {
  idle: '',
  connecting: 'border-white/6 bg-white/4 text-slate-500',
  listening: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  processing: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  speaking: 'border-violet-600/35 bg-violet-600/10 text-violet-400',
};

const DOT_ANIMATION: Record<VoiceUiState, string> = {
  idle: '',
  connecting: '',
  listening: 'animate-voice-blink',
  processing: 'animate-voice-blink [animation-duration:0.7s]',
  speaking: 'animate-voice-blink [animation-duration:1s]',
};

export default function VoiceButton({
  avatarId,
  conversationId,
  onConversationId,
  onTranscript,
  onError,
  onSessionEnd,
}: VoiceButtonProps) {
  const {
    connect,
    disconnect,
    status,
    isPlaying,
    messages,
    error,
    lastUserMessage,
    lastVoiceMessage,
  } = useVoice();

  const [isStarting, setIsStarting] = useState(false);
  const processedCount = useRef(0);
  const wasConnected = useRef(false);

  const isConnected = status.value === 'connected';

  // Forward live transcripts (user + assistant) as chat bubbles
  useEffect(() => {
    // The SDK clears messages on disconnect — reset the cursor
    if (messages.length < processedCount.current) {
      processedCount.current = 0;
    }
    for (let i = processedCount.current; i < messages.length; i++) {
      const m = messages[i];
      if (m.type === 'user_message' || m.type === 'assistant_message') {
        const content = m.message.content ?? '';
        if (content.trim()) {
          onTranscript({
            id: `voice-${crypto.randomUUID()}`,
            role: m.type === 'user_message' ? 'user' : 'assistant',
            content,
            created_at: new Date().toISOString(),
          });
        }
      }
    }
    processedCount.current = messages.length;
  }, [messages, onTranscript]);

  // Surface SDK errors (socket, mic, audio) to the chat error area
  useEffect(() => {
    if (error) {
      onError(`Errore modalità vocale: ${error.message}`);
    }
  }, [error, onError]);

  // Notify when a session ends (either by user click or remote close)
  useEffect(() => {
    if (isConnected) {
      wasConnected.current = true;
    } else if (wasConnected.current) {
      wasConnected.current = false;
      onSessionEnd();
    }
  }, [isConnected, onSessionEnd]);

  // Derive the UI state shown on the button + status pill
  let uiState: VoiceUiState = 'idle';
  if (isStarting || status.value === 'connecting') {
    uiState = 'connecting';
  } else if (isConnected) {
    if (isPlaying) {
      uiState = 'speaking';
    } else {
      const userAt = lastUserMessage?.receivedAt?.getTime() ?? 0;
      const assistantAt = lastVoiceMessage?.receivedAt?.getTime() ?? 0;
      uiState = userAt > assistantAt ? 'processing' : 'listening';
    }
  }

  const handleClick = async () => {
    if (isConnected) {
      await disconnect();
      return;
    }

    setIsStarting(true);
    try {
      const session = await startVoiceSession(avatarId, conversationId);
      onConversationId(session.conversation_id);
      await connect({
        auth: { type: 'accessToken', value: session.access_token },
        configId: session.config_id,
        sessionSettings: {
          type: 'session_settings',
          customSessionId: session.custom_session_id,
          ...(session.voice_id ? { voiceId: session.voice_id } : {}),
        },
      });
    } catch (err) {
      onError(
        err instanceof Error
          ? `Impossibile avviare la modalità vocale: ${err.message}`
          : 'Impossibile avviare la modalità vocale.',
      );
    } finally {
      setIsStarting(false);
    }
  };

  const label = STATE_LABELS[uiState];
  const inCall = uiState === 'listening' || uiState === 'processing' || uiState === 'speaking';

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      {label && (
        <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${STATUS_CLASSES[uiState]}`}>
          <span className={`h-[7px] w-[7px] rounded-full bg-current ${DOT_ANIMATION[uiState]}`} />
          {label}
        </span>
      )}
      <button
        className={`flex h-16 w-16 cursor-pointer items-center justify-center rounded-full border-none text-white transition disabled:cursor-wait disabled:opacity-60 ${
          inCall
            ? `bg-red-500/90 shadow-[0_8px_24px_rgba(239,68,68,0.4)] hover:scale-[1.08] ${uiState === 'listening' ? 'animate-voice-pulse' : ''}`
            : 'bg-gradient-to-br from-violet-600 to-cyan-500 shadow-[0_8px_24px_rgba(124,58,237,0.35)] hover:scale-[1.08] hover:shadow-[0_10px_28px_rgba(124,58,237,0.5)]'
        }`}
        onClick={handleClick}
        disabled={uiState === 'connecting'}
        id="voice-btn"
        aria-label={
          isConnected ? 'Termina conversazione vocale' : 'Avvia conversazione vocale'
        }
        title={isConnected ? 'Termina conversazione vocale' : 'Parla con l’avatar'}
      >
        {isConnected ? (
          /* Stop icon while in call */
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : uiState === 'connecting' ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          /* Microphone icon */
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>
    </div>
  );
}
