import { useState, useEffect, useRef } from 'react';
import { useVoice } from '@humeai/voice-react';
import { startVoiceSession } from '../services/voice';
import { startRingback, type Ringback } from '../services/ringtone';
import type { ChatMessage } from '../services/api';

type VoiceUiState = 'idle' | 'ringing' | 'listening' | 'processing' | 'speaking';

/* Duration of the outgoing-call ring before the customer picks up */
const RING_DURATION_MS = 4000;

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
  ringing: 'Sta squillando...',
  listening: 'In ascolto',
  processing: 'Sta elaborando...',
  speaking: 'Sta parlando...',
};

/* Status pill + blink dot styling per state */
const STATUS_CLASSES: Record<VoiceUiState, string> = {
  idle: '',
  ringing: 'border-white/6 bg-white/4 text-slate-400',
  listening: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  processing: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
  speaking: 'border-violet-600/35 bg-violet-600/10 text-violet-400',
};

const DOT_ANIMATION: Record<VoiceUiState, string> = {
  idle: '',
  ringing: 'animate-voice-blink',
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
    sendAssistantInput,
    mute,
    unmute,
  } = useVoice();

  const [isRinging, setIsRinging] = useState(false);
  const ringbackRef = useRef<Ringback | null>(null);
  const callCancelledRef = useRef(false);
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

  // Stop the ringback if the component unmounts mid-ring
  useEffect(() => {
    return () => {
      ringbackRef.current?.stop();
      ringbackRef.current = null;
    };
  }, []);

  const stopRingback = () => {
    ringbackRef.current?.stop();
    ringbackRef.current = null;
  };

  // Derive the UI state shown on the button + status pill
  let uiState: VoiceUiState = 'idle';
  if (isRinging) {
    uiState = 'ringing';
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
    // Hang up while it's still ringing: abort the outgoing call
    if (isRinging) {
      callCancelledRef.current = true;
      stopRingback();
      setIsRinging(false);
      await disconnect();
      return;
    }

    // Hang up during the conversation
    if (isConnected) {
      await disconnect();
      return;
    }

    // ── Start the outgoing call ─────────────────────
    callCancelledRef.current = false;
    setIsRinging(true);
    // Must start inside the click gesture for audio autoplay policies
    ringbackRef.current = startRingback();
    const ringDone = new Promise((resolve) => setTimeout(resolve, RING_DURATION_MS));

    try {
      const session = await startVoiceSession(avatarId, conversationId, true);
      if (callCancelledRef.current) return;
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
      if (callCancelledRef.current) {
        await disconnect();
        return;
      }

      // The customer hasn't picked up yet: keep the mic muted while it rings
      mute();
      await ringDone;
      if (callCancelledRef.current) {
        await disconnect();
        return;
      }

      // Call connected: if the persona starts the conversation EVI speaks
      // its self-introduction; otherwise the avatar stays silent and waits
      // for the operator to talk first
      if (session.greeting) {
        sendAssistantInput(session.greeting);
      }
      unmute();
    } catch (err) {
      if (!callCancelledRef.current) {
        onError(
          err instanceof Error
            ? `Impossibile avviare la chiamata: ${err.message}`
            : 'Impossibile avviare la chiamata.',
        );
      }
    } finally {
      stopRingback();
      setIsRinging(false);
    }
  };

  const label = STATE_LABELS[uiState];
  const callActive = uiState !== 'idle';

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      {label && (
        <span className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${STATUS_CLASSES[uiState]}`}>
          <span className={`h-[7px] w-[7px] rounded-full bg-current ${DOT_ANIMATION[uiState]}`} />
          {label}
        </span>
      )}
      <button
        className={`flex h-16 cursor-pointer items-center justify-center rounded-full border-none text-white transition ${
          callActive
            ? `w-16 bg-red-500/90 shadow-[0_8px_24px_rgba(239,68,68,0.4)] hover:scale-[1.08] ${
                uiState === 'ringing' || uiState === 'listening' ? 'animate-voice-pulse' : ''
              }`
            : 'gap-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 px-8 text-base font-semibold shadow-[0_8px_24px_rgba(16,185,129,0.35)] hover:scale-[1.05] hover:shadow-[0_10px_28px_rgba(16,185,129,0.5)]'
        }`}
        onClick={handleClick}
        id="voice-btn"
        aria-label={callActive ? 'Riaggancia' : 'Chiama l’avatar'}
        title={callActive ? 'Riaggancia' : 'Chiama l’avatar'}
      >
        {callActive ? (
          /* Hang-up icon (rotated phone) */
          <svg className="rotate-[135deg]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        ) : (
          <>
            {/* Phone icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            Chiama
          </>
        )}
      </button>
    </div>
  );
}
