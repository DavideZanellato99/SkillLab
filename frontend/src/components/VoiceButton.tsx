import { useState, useEffect, useRef } from 'react';
import { startVoiceSession } from '../services/voice';
import { VoiceCall } from '../services/voiceCall';
import { startRingback, type Ringback } from '../services/ringtone';
import type { ChatMessage } from '../services/api';
import Tooltip from './Tooltip';

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
  /** Mirrors whether a call is live (ChatPage pauses DB sync during calls). */
  onActiveChange: (active: boolean) => void;
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
  onActiveChange,
}: VoiceButtonProps) {
  const [isRinging, setIsRinging] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const callRef = useRef<VoiceCall | null>(null);
  const ringbackRef = useRef<Ringback | null>(null);
  const callCancelledRef = useRef(false);

  // Live callbacks without re-creating the call client
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  useEffect(() => {
    onActiveChange(isRinging || isConnected);
  }, [isRinging, isConnected, onActiveChange]);

  // Hang up if the component unmounts mid-call
  useEffect(() => {
    return () => {
      ringbackRef.current?.stop();
      ringbackRef.current = null;
      callRef.current?.disconnect();
      callRef.current = null;
    };
  }, []);

  const stopRingback = () => {
    ringbackRef.current?.stop();
    ringbackRef.current = null;
  };

  const pushTranscript = (role: 'user' | 'assistant', content: string) => {
    if (!content.trim()) return;
    onTranscriptRef.current({
      id: `voice-${crypto.randomUUID()}`,
      role,
      content,
      created_at: new Date().toISOString(),
    });
  };

  // Derive the UI state shown on the button + status pill
  let uiState: VoiceUiState = 'idle';
  if (isRinging) {
    uiState = 'ringing';
  } else if (isConnected) {
    if (isSpeaking) {
      uiState = 'speaking';
    } else if (isProcessing) {
      uiState = 'processing';
    } else {
      uiState = 'listening';
    }
  }

  const handleClick = async () => {
    // Hang up while it's still ringing: abort the outgoing call
    if (isRinging) {
      callCancelledRef.current = true;
      stopRingback();
      setIsRinging(false);
      callRef.current?.disconnect();
      callRef.current = null;
      return;
    }

    // Hang up during the conversation
    if (isConnected) {
      callRef.current?.disconnect();
      return;
    }

    // ── Start the outgoing call ─────────────────────
    callCancelledRef.current = false;
    setIsRinging(true);
    // Must start inside the click gesture for audio autoplay policies
    ringbackRef.current = startRingback();
    const ringDone = new Promise((resolve) => setTimeout(resolve, RING_DURATION_MS));

    try {
      const session = await startVoiceSession(avatarId, conversationId);
      if (callCancelledRef.current) return;
      onConversationId(session.conversation_id);

      const call = new VoiceCall(session.session_id, {
        onUserFinal: (text) => pushTranscript('user', text),
        onAssistantEnd: (text) => pushTranscript('assistant', text),
        onSpeakingChange: setIsSpeaking,
        onProcessingChange: setIsProcessing,
        onError: (message) => onErrorRef.current(`Errore modalità vocale: ${message}`),
        onClose: () => {
          callRef.current = null;
          setIsConnected(false);
          setIsSpeaking(false);
          setIsProcessing(false);
          onSessionEndRef.current();
        },
      });
      callRef.current = call;

      // Connect during the ring (mic stays muted) to hide the setup latency
      await call.connect();
      if (callCancelledRef.current) {
        call.disconnect();
        return;
      }

      await ringDone;
      if (callCancelledRef.current) {
        call.disconnect();
        return;
      }

      // Call connected: the avatar is the caller and stays silent until
      // the operator (the user) answers and introduces themselves
      setIsConnected(true);
      call.start();
    } catch (err) {
      callRef.current?.disconnect();
      callRef.current = null;
      if (!callCancelledRef.current) {
        onErrorRef.current(
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
      <Tooltip content={callActive ? 'Riaggancia' : 'Chiama l’avatar'}>
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
      </Tooltip>
    </div>
  );
}
