import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { VoiceProvider, useVoice } from '@humeai/voice-react';
import type { ChatMessage } from '../services/api';
import { getAvatarImageUrl } from '../services/api';
import {
  useAvatar,
  useConversations,
  useConversation,
  useDeleteConversation,
} from '../hooks/useApi';
import VoiceButton from './VoiceButton';
import { categoryBadgeClasses } from './categoryStyles';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-[5px] py-1">
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500"></span>
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500 [animation-delay:0.2s]"></span>
      <span className="h-2 w-2 animate-typing-bounce rounded-full bg-slate-500 [animation-delay:0.4s]"></span>
    </div>
  );
}

export default function ChatPage() {
  return (
    <VoiceProvider>
      <ChatPageContent />
    </VoiceProvider>
  );
}

function ChatPageContent() {
  const { avatarId } = useParams<{ avatarId: string }>();

  // ── TanStack queries ──────────────────────────────
  const { data: avatar, isError: avatarError } = useAvatar(avatarId);
  const { data: conversations = [] } = useConversations(avatarId);

  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const {
    data: conversationData,
    isFetching: isLoadingConversation,
  } = useConversation(currentConversationId);

  // ── TanStack mutations ────────────────────────────
  const deleteConversationMutation = useDeleteConversation();

  // ── Voice mode ────────────────────────────────────
  const queryClient = useQueryClient();
  const { status: voiceStatus } = useVoice();
  const voiceActive = voiceStatus.value === 'connected' || voiceStatus.value === 'connecting';

  // ── Local state ───────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Sync messages from loaded conversation (paused while the voice session
  // is live: transcripts arrive in real time and the DB catches up at the end)
  useEffect(() => {
    if (conversationData?.messages && !voiceActive) {
      setMessages(conversationData.messages);
    }
  }, [conversationData, voiceActive]);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load a conversation's messages
  const loadConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    setError(null);
  };

  // Start a new conversation
  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
  };

  // ── Voice mode handlers ───────────────────────────

  // Append a live voice transcript bubble; consecutive assistant segments
  // of the same turn are merged into a single bubble
  const handleVoiceTranscript = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (
        msg.role === 'assistant' &&
        last?.role === 'assistant' &&
        typeof last.id === 'string' &&
        last.id.startsWith('voice-')
      ) {
        return [...prev.slice(0, -1), { ...last, content: `${last.content} ${msg.content}` }];
      }
      return [...prev, msg];
    });
  }, []);

  const handleVoiceConversationId = useCallback((id: string) => {
    setCurrentConversationId((prev) => (prev === id ? prev : id));
    setError(null);
  }, []);

  // When the voice session ends, re-sync everything from the DB
  const handleVoiceSessionEnd = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [queryClient]);

  // Delete a conversation
  const handleDeleteConversation = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversationMutation.mutate(convId, {
      onSuccess: () => {
        if (currentConversationId === convId) {
          handleNewConversation();
        }
      },
    });
  };

  // Format timestamp
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ── Render guards ─────────────────────────────────

  if (!avatar && !avatarError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden [animation-duration:0.3s]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
          <TypingIndicator />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  if (avatarError || !avatar) {
    return (
      <div className="flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden [animation-duration:0.3s]">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
          <p className="mb-4 text-base text-red-400">Impossibile caricare i dati dell'avatar.</p>
          <Link to="/" className="text-sm text-violet-400 no-underline transition-colors hover:text-slate-100">← Torna alla Gallery</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden [animation-duration:0.3s]" id="chat-page">
      {/* Sidebar */}
      <aside
        className={`flex w-80 min-w-80 animate-slide-in-left flex-col overflow-y-auto border-r border-white/6 bg-gray-900/50 backdrop-blur-2xl max-[900px]:fixed max-[900px]:bottom-0 max-[900px]:left-0 max-[900px]:top-16 max-[900px]:z-40 max-[900px]:transition-transform max-[480px]:w-full max-[480px]:min-w-full ${
          sidebarOpen ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'
        }`}
        id="chat-sidebar"
      >
        {/* Avatar Info */}
        <div className="border-b border-white/6 p-8 text-center">
          <div className="mx-auto mb-4 h-[100px] w-[100px] overflow-hidden rounded-3xl border-2 border-white/6 shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition hover:scale-105 hover:border-violet-600 hover:shadow-[0_0_30px_rgba(124,58,237,0.3)]">
            <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
          </div>
          <h2 className="mb-1 font-heading text-xl font-bold text-slate-100">{avatar.name}</h2>
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(avatar.category)}`}>
              {avatar.category}
            </span>
            {avatar.difficulty && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-orange-400"
                title="Grado di difficoltà dello scenario"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63 1.12 6.53L12 17.35l-5.87 3.08 1.12-6.53L2.5 9.27l6.6-1.01L12 2z" />
                </svg>
                {avatar.difficulty}
              </span>
            )}
          </div>
          <p className="text-[0.8rem] leading-normal text-slate-500">{avatar.description}</p>
        </div>

        {/* New Conversation Button */}
        <button
          className="mx-4 mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
          onClick={handleNewConversation}
          id="new-conversation-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuova conversazione
        </button>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-2 px-1 text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Conversazioni</h3>
          {conversations.length === 0 ? (
            <p className="py-6 text-center text-[0.8rem] italic text-slate-500">Nessuna conversazione ancora.</p>
          ) : (
            <ul className="flex list-none flex-col gap-1">
              {conversations.map((conv) => {
                const isActive = currentConversationId === conv.id;
                return (
                  <li
                    key={conv.id}
                    className={`group/conv flex cursor-pointer items-center gap-2 rounded-lg p-2 transition ${
                      isActive ? 'border-l-2 border-violet-600 bg-violet-600/10' : 'hover:bg-white/8'
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <span className={`block truncate text-[0.8rem] ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>
                        {conv.last_message_preview || 'Nuova conversazione'}
                      </span>
                      <span className="mt-0.5 block text-[0.68rem] text-slate-500">
                        {formatDate(conv.updated_at)} · {conv.message_count} msg
                      </span>
                    </div>
                    <button
                      className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover/conv:opacity-100"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                      aria-label="Elimina conversazione"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Back to Gallery */}
        <Link
          to="/"
          className="flex items-center gap-2 border-t border-white/6 px-6 py-4 text-[0.85rem] font-medium text-slate-400 no-underline transition hover:bg-white/8 hover:text-slate-100"
          id="back-to-gallery"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Torna alla Gallery
        </Link>
      </aside>

      {/* Sidebar toggle for mobile */}
      <button
        className="fixed bottom-8 left-4 z-50 hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/6 bg-gray-900/90 text-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-lg transition hover:border-violet-600 hover:bg-violet-600/20 max-[900px]:flex"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Apri o chiudi la barra laterale"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Main Chat Area */}
      <main className="relative flex min-w-0 flex-1 flex-col" id="chat-main">
        {/* Chat Header */}
        <header className="flex min-h-16 items-center justify-between border-b border-white/6 bg-gray-900/40 px-8 py-4 backdrop-blur-lg max-[480px]:px-4 max-[480px]:py-2">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/6">
              <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-100">{avatar.name}</h2>
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <span className="h-1.5 w-1.5 animate-status-pulse rounded-full bg-emerald-500"></span>
                In personaggio
              </span>
            </div>
          </div>
          <span
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-600/35 bg-violet-600/10 px-3 py-1 text-xs font-semibold text-violet-400"
            title="Con questo avatar si interagisce solo a voce"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            Solo vocale
          </span>
        </header>

        {/* Messages Area */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-8 max-[900px]:p-4" id="chat-messages">
          {messages.length === 0 && !isLoadingConversation && (
            <div className="flex flex-1 animate-fade-in-up flex-col items-center justify-center p-12 text-center [animation-duration:0.5s]">
              <div className="mb-6 h-[120px] w-[120px] animate-float overflow-hidden rounded-3xl border-2 border-white/6 shadow-[0_0_30px_rgba(124,58,237,0.3)] [animation-duration:4s] max-[480px]:h-20 max-[480px]:w-20">
                <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
              </div>
              <h3 className="mb-2 bg-gradient-to-br from-violet-600 to-cyan-500 bg-clip-text font-heading text-2xl font-bold text-transparent max-[480px]:text-xl">
                Parla con {avatar.name}
              </h3>
              <p className="mb-8 max-w-[500px] text-sm leading-relaxed text-slate-500">{avatar.description}</p>
              <div className="flex max-w-[480px] items-center gap-4 rounded-2xl border border-violet-600/35 bg-violet-600/10 px-6 py-4 text-left text-slate-400">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <p className="m-0 text-sm leading-normal">
                  Questa esperienza simula una <strong className="font-semibold text-slate-100">telefonata</strong>: premi{' '}
                  <strong className="font-semibold text-slate-100">Chiama</strong>, attendi lo squillo e il cliente
                  risponderà al telefono. La trascrizione apparirà qui in tempo reale.
                </p>
              </div>
            </div>
          )}

          {isLoadingConversation && (
            <div className="flex justify-center p-8">
              <TypingIndicator />
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`flex max-w-[75%] animate-message-in gap-2 max-[900px]:max-w-[90%] ${
                msg.role === 'user' ? 'flex-row-reverse self-end' : 'self-start'
              }`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {msg.role === 'assistant' && (
                <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/6">
                  <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
                </div>
              )}
              <div
                className={`relative rounded-2xl px-6 py-4 leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-br-[4px] bg-gradient-to-br from-violet-600 to-violet-700 text-white'
                    : 'rounded-bl-[4px] border border-white/6 bg-slate-800/70 text-slate-100 backdrop-blur-md'
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                <span className={`mt-1 block text-[0.65rem] opacity-60 ${msg.role === 'user' ? 'text-right text-white/70' : 'text-slate-500'}`}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/8 px-8 py-2 text-[0.82rem] text-red-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Voice Dock — the only way to interact with the avatar */}
        <div
          className="flex flex-col items-center gap-2 border-t border-white/6 bg-gray-900/30 px-8 py-6 backdrop-blur-lg max-[900px]:px-4"
          id="voice-dock"
        >
          {avatarId && (
            <VoiceButton
              avatarId={avatarId}
              conversationId={currentConversationId}
              onConversationId={handleVoiceConversationId}
              onTranscript={handleVoiceTranscript}
              onError={setError}
              onSessionEnd={handleVoiceSessionEnd}
            />
          )}
          <p className="text-center text-xs text-slate-500">
            {voiceActive ? (
              <>Chiamata in corso · premi il pulsante rosso per riagganciare</>
            ) : (
              <>📞 Premi Chiama per telefonare a {avatar.name}</>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
