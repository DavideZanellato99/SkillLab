import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../services/auth';
import type { ChatMessage, ChatConversationSummary } from '../services/api';
import { getAvatarImageUrl } from '../services/api';
import {
  useAvatar,
  useConversations,
  useConversation,
  useRenameConversation,
  useDeleteConversation,
  useConversationEvaluation,
  useEvaluateConversation,
  useSendChatMessage,
  useEndChatConversation,
} from '../hooks/useApi';
import VoiceButton from './VoiceButton';
import CallRecordingPlayer from './CallRecordingPlayer';
import EvaluationModal from './EvaluationModal';
import ConversationModeBadge from './ConversationModeBadge';
import MessageEmotions, { splitEmotionTag } from './MessageEmotions';
import Tooltip from './Tooltip';
import { categoryBadgeClasses } from './categoryStyles';
import { matchesSearch } from './tableSearch';

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
  const { avatarId } = useParams<{ avatarId: string }>();
  const { user } = useAuth();
  const canDeleteConversations = isAdmin(user);

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
  const renameConversationMutation = useRenameConversation();

  // ── AI evaluation of the conversation ─────────────
  const { data: evaluation } = useConversationEvaluation(currentConversationId);
  const evaluateMutation = useEvaluateConversation();
  const { mutate: runEvaluation } = evaluateMutation;
  const [showEvaluation, setShowEvaluation] = useState(false);
  // True only for the modal opened by a session that just ended (call or
  // chat): there the conversation must be named before it can be dismissed
  const [isPostSession, setIsPostSession] = useState(false);

  // ── Voice mode ────────────────────────────────────
  const queryClient = useQueryClient();
  const [voiceActive, setVoiceActive] = useState(false);
  // Conversation closed in this session: known to be over before the
  // backend has finished recording it
  const [endedConversationId, setEndedConversationId] = useState<string | null>(null);

  // ── Text chat mode ────────────────────────────────
  // Same roleplay as a call, only written: the operator opens the
  // conversation and the LLM answers in character, no STT and no TTS.
  const sendMessageMutation = useSendChatMessage();
  const endChatMutation = useEndChatConversation();
  // A chat is live in this session. Set from the first message on (and by
  // the Chatta button, which starts one before any id exists), it pauses
  // the DB sync exactly like a call does.
  const [chatStarted, setChatStarted] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Local state ───────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Expanded conversations panel ──────────────────
  // The sidebar list is cramped: this overlay shows the same conversations
  // with room for the preview and the state of each call.
  const [conversationsExpanded, setConversationsExpanded] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');

  // ── Inline rename of a sidebar conversation ───────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Esc unmounts the input, which also triggers its blur: this tells the
  // blur handler to discard instead of saving
  const renameCancelled = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Sync messages from loaded conversation (paused while a session is live:
  // call transcripts and chat replies arrive here first and the DB catches
  // up behind them, so re-reading it mid-session would undo them)
  useEffect(() => {
    if (conversationData?.messages && !voiceActive && !chatStarted) {
      setMessages(conversationData.messages);
    }
  }, [conversationData, voiceActive, chatStarted]);

  // Scroll when messages change, and when the avatar starts composing
  useEffect(() => {
    scrollToBottom();
  }, [messages, sendMessageMutation.isPending, scrollToBottom]);

  // Load a conversation's messages
  const loadConversation = (conversationId: string) => {
    setCurrentConversationId(conversationId);
    setError(null);
    // The dock follows the conversation being opened, not the one left behind
    setChatStarted(false);
    setChatInput('');
  };

  const closeConversationsPanel = useCallback(() => {
    setConversationsExpanded(false);
    setConversationSearch('');
  }, []);

  // Picking a conversation from the expanded panel opens it and gets the
  // panel out of the way
  const openFromPanel = (conversationId: string) => {
    loadConversation(conversationId);
    closeConversationsPanel();
  };

  // Esc closes the panel, unless a title is being edited inside it
  useEffect(() => {
    if (!conversationsExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !renamingId) closeConversationsPanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conversationsExpanded, renamingId, closeConversationsPanel]);

  // Start a new conversation
  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    // Back to the channel choice: call or chat
    setChatStarted(false);
    setChatInput('');
  };

  // ── Text chat handlers ────────────────────────────

  // Open the composer. The conversation itself is created server-side by
  // the first message, so until then there is nothing to record.
  const handleStartChat = () => {
    setError(null);
    setChatStarted(true);
    // Wait for the composer to mount before handing it the focus
    requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const handleSendMessage = () => {
    const content = chatInput.trim();
    if (!content || sendMessageMutation.isPending || !avatarId) return;

    setChatInput('');
    setError(null);
    setChatStarted(true);
    // The box grew with the text it no longer holds; sending with the
    // button also took the focus away from it
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.focus();
    }

    // Show the operator's message straight away; the reply joins it when
    // the LLM answers. The placeholder id is swapped for the stored one.
    const pendingId = `chat-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev,
      { id: pendingId, role: 'user', content, created_at: new Date().toISOString() },
    ]);

    sendMessageMutation.mutate(
      { avatarId, conversationId: currentConversationId, content },
      {
        onSuccess: (exchange) => {
          setMessages((prev) => [
            ...prev.map((msg) => (msg.id === pendingId ? exchange.user_message : msg)),
            exchange.assistant_message,
          ]);
          setCurrentConversationId((prev) => prev ?? exchange.conversation_id);
        },
        onError: (err) => {
          // Nothing was written server-side: take the message back out of
          // the transcript and return it to the composer to retry
          setMessages((prev) => prev.filter((msg) => msg.id !== pendingId));
          setChatInput(content);
          setError(
            err instanceof Error
              ? `Impossibile inviare il messaggio: ${err.message}`
              : 'Impossibile inviare il messaggio.',
          );
        },
      },
    );
  };

  // Closing the chat is the equivalent of hanging up: the transcript
  // becomes final and the AI trainer judges it
  const handleEndChat = () => {
    if (!currentConversationId) {
      // Nothing was ever sent: there is no conversation to close
      setChatStarted(false);
      setChatInput('');
      return;
    }
    const conversationId = currentConversationId;
    endChatMutation.mutate(conversationId, {
      onSuccess: () => {
        setChatStarted(false);
        setChatInput('');
        setEndedConversationId(conversationId);
        if (!messages.some((m) => m.role === 'user')) return;
        setIsPostSession(true);
        setShowEvaluation(true);
        runEvaluation(conversationId);
      },
      onError: (err) => {
        setError(
          err instanceof Error
            ? `Impossibile terminare la chat: ${err.message}`
            : 'Impossibile terminare la chat.',
        );
      },
    });
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

  // When the voice session ends, re-sync from the DB and have the AI
  // trainer judge the whole conversation (only if the operator spoke)
  const handleVoiceSessionEnd = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    // Hanging up closes the socket from here, so this fires while the
    // backend is still writing ended_at: the refetch above can still come
    // back "open". The id is remembered locally so the dock does not wait
    // for the server to catch up.
    setEndedConversationId(currentConversationId);
    if (!currentConversationId || !messages.some((m) => m.role === 'user')) return;
    setIsPostSession(true);
    setShowEvaluation(true);
    runEvaluation(currentConversationId);
  }, [queryClient, currentConversationId, messages, runEvaluation]);

  // ── Rename a conversation (available to every user) ──
  const startRename = (conv: ChatConversationSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    renameCancelled.current = false;
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  // The title is mandatory: an empty name is discarded and the current one kept
  const commitRename = (conv: ChatConversationSummary) => {
    if (renameCancelled.current) return;
    const title = renameValue.trim();
    setRenamingId(null);
    if (title && title !== conv.title) {
      renameConversationMutation.mutate({ conversationId: conv.id, title });
    }
  };

  const cancelRename = () => {
    renameCancelled.current = true;
    setRenamingId(null);
  };

  // Naming the conversation is what closes the post-call modal
  const handleSubmitTitle = (title: string) => {
    if (!currentConversationId) return;
    renameConversationMutation.mutate(
      { conversationId: currentConversationId, title },
      {
        onSuccess: () => {
          setShowEvaluation(false);
          setIsPostSession(false);
          evaluateMutation.reset();
        },
      },
    );
  };

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

  // Summary of the open conversation, taken from the sidebar list: it is
  // already cached, so selecting a conversation shows the right dock at
  // once. Reading ended_at from the detail query instead would flash the
  // call button for as long as its fetch takes.
  const currentSummary = conversations.find((conv) => conv.id === currentConversationId);

  // Search applies only inside the expanded panel: the sidebar always lists
  // every conversation
  const visibleConversations = conversations.filter((conv) =>
    matchesSearch(conversationSearch, conv.title, conv.last_message_preview),
  );

  // Once the conversation is over the transcript is final: the backend
  // refuses to reopen it, so the dock stops offering to continue.
  // voiceActive keeps VoiceButton mounted while a call is live, and the
  // explicit id check matters because with nothing selected both ids are
  // null and would compare equal.
  const isConversationClosed =
    !voiceActive &&
    currentConversationId !== null &&
    (endedConversationId === currentConversationId || !!currentSummary?.ended_at);

  // The list entry answers instantly when switching conversations; the
  // detail query covers the conversation just created by a call, which the
  // list has not caught up with yet.
  const currentTitle = currentSummary?.title ?? conversationData?.title ?? null;

  // Channel of the open conversation. A call and a chat are never mixed:
  // the backend rejects continuing one on the other channel, so the dock
  // only ever offers the one this conversation was opened on.
  const currentMode = currentSummary?.mode ?? conversationData?.mode ?? null;

  // chatStarted covers the conversation being written right now, whose id
  // and mode the caches can still be missing; currentMode covers a text
  // conversation reopened from the list.
  const isChatMode = chatStarted || currentMode === 'text';

  // Chatta always opens a NEW text conversation, so it is offered only
  // when there is no transcript on screen waiting to be continued.
  const canStartChat = !voiceActive && !isChatMode && currentConversationId === null;

  // After a session the modal offers to replace the automatic name. Without
  // an id there is nothing to save a new name to, so the field is hidden.
  const renamableTitle = isPostSession && currentConversationId ? currentTitle : null;

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
              <Tooltip content="Grado di difficoltà dello scenario">
                <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[0.7rem] font-semibold text-orange-400">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.63 1.12 6.53L12 17.35l-5.87 3.08 1.12-6.53L2.5 9.27l6.6-1.01L12 2z" />
                  </svg>
                  Difficoltà: {avatar.difficulty}
                </span>
              </Tooltip>
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
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-500">Conversazioni</h3>
            <Tooltip content="Espandi le conversazioni">
              <button
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-slate-500 transition hover:bg-violet-600/12 hover:text-violet-400"
                onClick={() => setConversationsExpanded(true)}
                aria-label="Espandi le conversazioni"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </Tooltip>
          </div>
          {conversations.length === 0 ? (
            <p className="py-6 text-center text-[0.8rem] italic text-slate-500">Nessuna conversazione ancora.</p>
          ) : (
            <ul className="flex list-none flex-col gap-1">
              {conversations.map((conv) => {
                const isActive = currentConversationId === conv.id;
                // While the expanded panel is open the rename input belongs
                // to it: two mounted inputs would fight over the focus
                const isRenaming = renamingId === conv.id && !conversationsExpanded;
                return (
                  <li
                    key={conv.id}
                    className={`group/conv flex cursor-pointer items-center gap-2 rounded-lg p-2 transition ${
                      isActive ? 'border-l-2 border-violet-600 bg-violet-600/10' : 'hover:bg-white/8'
                    }`}
                    onClick={() => !isRenaming && loadConversation(conv.id)}
                  >
                    <div className="min-w-0 flex-1">
                      {isRenaming ? (
                        <input
                          className="w-full rounded-md border border-violet-600/50 bg-gray-900/80 px-2 py-1 text-[0.8rem] text-slate-100 outline-none transition focus:border-violet-500"
                          value={renameValue}
                          maxLength={120}
                          autoFocus
                          placeholder="Nome della conversazione"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(conv)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitRename(conv);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                        />
                      ) : (
                        <span className={`block truncate text-[0.8rem] ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>
                          {conv.title}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[0.68rem] text-slate-500">
                        {formatDate(conv.updated_at)} · {conv.message_count} msg
                      </span>
                    </div>
                    {!isRenaming && (
                      <button
                        className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1 text-slate-500 opacity-0 transition hover:bg-violet-600/12 hover:text-violet-400 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                        onClick={(e) => startRename(conv, e)}
                        aria-label="Rinomina conversazione"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </button>
                    )}
                    {canDeleteConversations && !isRenaming && (
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
                    )}
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
            <div className="min-w-0">
              <h2 className="font-heading text-base font-bold text-slate-100">{avatar.name}</h2>
              {currentTitle && (
                <p className="truncate text-[0.72rem] text-slate-500">{currentTitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {evaluation && !voiceActive && (
              <Tooltip content="Rivedi la valutazione della conversazione">
                <button
                  className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 transition hover:-translate-y-px hover:bg-cyan-500/20"
                  onClick={() => {
                    evaluateMutation.reset();
                    setIsPostSession(false);
                    setShowEvaluation(true);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Valutazione · {evaluation.overall_score.toLocaleString('it-IT', { maximumFractionDigits: 1 })}/10
                </button>
              </Tooltip>
            )}
          </div>
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
              <div className="flex max-w-[520px] flex-col gap-3 rounded-2xl border border-violet-600/35 bg-violet-600/10 px-6 py-4 text-left text-slate-400">
                <p className="flex items-center gap-4 text-sm leading-normal">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>
                    <strong className="font-semibold text-slate-100">Chiama</strong> simula una telefonata: attendi lo
                    squillo e il cliente risponderà al telefono, con la trascrizione qui in tempo reale.
                  </span>
                </p>
                <p className="flex items-center gap-4 text-sm leading-normal">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-violet-400">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>
                    <strong className="font-semibold text-slate-100">Chatta</strong> apre la stessa simulazione per
                    iscritto: stesso cliente, stesso scenario, solo scritto invece che parlato.
                  </span>
                </p>
              </div>
            </div>
          )}

          {isLoadingConversation && (
            <div className="flex justify-center p-8">
              <TypingIndicator />
            </div>
          )}

          {messages.map((msg, index) => {
            const { text, emotions } =
              msg.role === 'user' ? splitEmotionTag(msg.content) : { text: msg.content, emotions: [] };
            return (
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
                  <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
                  <MessageEmotions emotions={emotions} />
                  <span className={`mt-1 block text-[0.65rem] opacity-60 ${msg.role === 'user' ? 'text-right text-white/70' : 'text-slate-500'}`}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
              </div>
            );
          })}

          {/* The avatar composing its written reply */}
          {sendMessageMutation.isPending && (
            <div className="flex max-w-[75%] animate-message-in gap-2 self-start">
              <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-white/6">
                <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
              </div>
              <div className="rounded-2xl rounded-bl-[4px] border border-white/6 bg-slate-800/70 px-6 py-3 backdrop-blur-md">
                <TypingIndicator />
              </div>
            </div>
          )}

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

        {/* Session dock — call or chat, the two ways to reach the avatar */}
        <div
          className="flex flex-col items-center gap-2 border-t border-white/6 bg-gray-900/30 px-8 py-6 backdrop-blur-lg max-[900px]:px-4"
          id="voice-dock"
        >
          {isConversationClosed ? (
            /* Session over: the transcript is final, only a new one is possible */
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Questa conversazione è terminata e non può essere ripresa.
              </p>
              {/* Calls leave an audio recording behind; chats do not */}
              {currentMode === 'voice' && currentConversationId && (
                <CallRecordingPlayer conversationId={currentConversationId} />
              )}
              <button
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
                onClick={handleNewConversation}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Ricomincia con {avatar.name}
              </button>
            </div>
          ) : isChatMode ? (
            /* Text chat: the operator writes, the avatar answers in character.
               Ending it is the same gesture as hanging up — the round red
               button sits where the hang-up one sits during a call. */
            <div className="flex w-full max-w-[860px] flex-col gap-2">
              <div className="flex items-end gap-4">
                <div className="flex min-w-0 flex-1 items-end gap-2 rounded-2xl border border-white/6 bg-slate-800/50 px-4 py-2 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]">
                  <textarea
                    ref={chatInputRef}
                    className="max-h-32 flex-1 resize-none border-none bg-transparent py-2 text-sm leading-relaxed text-slate-100 outline-none placeholder:text-slate-500"
                    rows={1}
                    maxLength={2000}
                    value={chatInput}
                    placeholder={`Scrivi a ${avatar.name}...`}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                      // Grow with the text, up to the max-height above
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      // Enter sends, Shift+Enter breaks the line
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <Tooltip content="Invia il messaggio">
                    <button
                      className="mb-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border-none bg-gradient-to-br from-violet-600 to-violet-700 text-white shadow-[0_4px_12px_rgba(124,58,237,0.35)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                      onClick={handleSendMessage}
                      disabled={!chatInput.trim() || sendMessageMutation.isPending}
                      aria-label="Invia il messaggio"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </Tooltip>
                </div>
                <Tooltip content="Termina la chat">
                  <button
                    className="flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-red-500/90 text-white shadow-[0_8px_24px_rgba(239,68,68,0.4)] transition hover:scale-[1.08] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                    onClick={handleEndChat}
                    disabled={endChatMutation.isPending}
                    id="end-chat-btn"
                    aria-label="Termina la chat"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
              <p className="text-center text-xs text-slate-500">
                {sendMessageMutation.isPending ? (
                  <>{avatar.name} sta scrivendo...</>
                ) : endChatMutation.isPending ? (
                  <>Chiusura della chat in corso...</>
                ) : (
                  <>💬 Invio manda il messaggio, Shift+Invio va a capo · Premi il pulsante rosso per terminare</>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-4">
                {avatarId && (
                  <VoiceButton
                    avatarId={avatarId}
                    conversationId={currentConversationId}
                    onConversationId={handleVoiceConversationId}
                    onTranscript={handleVoiceTranscript}
                    onError={setError}
                    onSessionEnd={handleVoiceSessionEnd}
                    onActiveChange={setVoiceActive}
                  />
                )}
                {canStartChat && (
                  <Tooltip content="Scrivi all’avatar invece di chiamarlo">
                    <button
                      className="flex h-16 cursor-pointer items-center justify-center gap-2.5 rounded-full border-none bg-gradient-to-br from-violet-600 to-violet-700 px-8 text-base font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.35)] transition hover:scale-[1.05] hover:shadow-[0_10px_28px_rgba(124,58,237,0.5)]"
                      onClick={handleStartChat}
                      id="chat-btn"
                      aria-label="Chatta con l’avatar"
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      Chatta
                    </button>
                  </Tooltip>
                )}
              </div>
              <p className="text-center text-xs text-slate-500">
                {voiceActive ? (
                  <>Chiamata in corso · premi il pulsante rosso per riagganciare</>
                ) : canStartChat ? (
                  <>Chiama {avatar.name} al telefono, oppure scrivigli in chat</>
                ) : (
                  <>📞 Premi Chiama per telefonare a {avatar.name}</>
                )}
              </p>
            </>
          )}
        </div>

        {/* Post-call evaluation */}
        {showEvaluation && (
          <EvaluationModal
            avatarName={avatar.name}
            evaluation={evaluation ?? null}
            isLoading={evaluateMutation.isPending}
            error={evaluateMutation.error instanceof Error ? evaluateMutation.error.message : null}
            onRetry={() => currentConversationId && runEvaluation(currentConversationId)}
            currentTitle={renamableTitle}
            onSubmitTitle={handleSubmitTitle}
            isSavingTitle={renameConversationMutation.isPending}
            titleError={
              renameConversationMutation.error instanceof Error
                ? renameConversationMutation.error.message
                : null
            }
            onClose={() => {
              setShowEvaluation(false);
              setIsPostSession(false);
              evaluateMutation.reset();
              renameConversationMutation.reset();
            }}
          />
        )}
      </main>

      {/* Expanded conversations panel */}
      {conversationsExpanded && (
        <div
          className="fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]"
          onClick={closeConversationsPanel}
        >
          <div
            className="relative flex h-[85vh] w-full max-w-[860px] animate-modal-in flex-col overflow-hidden rounded-3xl border border-white/6 bg-gray-900/95 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center gap-4 border-b border-white/6 px-8 py-6 max-[480px]:px-5 max-[480px]:py-4">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/6">
                <img className="h-full w-full object-cover" src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-heading text-lg font-bold text-slate-100">Conversazioni</h2>
                <p className="truncate text-[0.78rem] text-slate-500">
                  {conversations.length === 1
                    ? `1 conversazione con ${avatar.name}`
                    : `${conversations.length} conversazioni con ${avatar.name}`}
                </p>
              </div>
              <button
                className="shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100"
                onClick={closeConversationsPanel}
                aria-label="Chiudi"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Search */}
            {conversations.length > 0 && (
              <div className="border-b border-white/6 px-8 py-4 max-[480px]:px-5">
                <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    className="flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    placeholder="Cerca per nome o contenuto..."
                    value={conversationSearch}
                    onChange={(e) => setConversationSearch(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto px-8 py-5 max-[480px]:px-5">
              {visibleConversations.length === 0 ? (
                <p className="py-12 text-center text-[0.85rem] italic text-slate-500">
                  {conversationSearch
                    ? 'Nessuna conversazione corrisponde alla ricerca.'
                    : 'Nessuna conversazione ancora.'}
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-2">
                  {visibleConversations.map((conv) => {
                    const isActive = currentConversationId === conv.id;
                    const isRenaming = renamingId === conv.id;
                    return (
                      <li
                        key={conv.id}
                        className={`group/conv flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
                          isActive
                            ? 'border-violet-600/50 bg-violet-600/10'
                            : 'border-white/6 bg-white/2 hover:-translate-y-px hover:border-violet-600/40 hover:bg-white/6'
                        }`}
                        onClick={() => !isRenaming && openFromPanel(conv.id)}
                      >
                        <div className="min-w-0 flex-1">
                          {isRenaming ? (
                            <input
                              className="w-full rounded-lg border border-violet-600/50 bg-gray-900/80 px-3 py-1.5 text-[0.9rem] text-slate-100 outline-none transition focus:border-violet-500"
                              value={renameValue}
                              maxLength={120}
                              autoFocus
                              placeholder="Nome della conversazione"
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={() => commitRename(conv)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitRename(conv);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelRename();
                                }
                              }}
                            />
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`truncate text-[0.92rem] font-semibold ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                                {conv.title}
                              </span>
                              <ConversationModeBadge mode={conv.mode} />
                              {conv.ended_at ? (
                                <span className="shrink-0 rounded-full border border-white/6 bg-white/5 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-slate-500">
                                  Terminata
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-400">
                                  Aperta
                                </span>
                              )}
                            </div>
                          )}
                          {conv.last_message_preview && !isRenaming && (
                            <p className="mt-1 truncate text-[0.8rem] text-slate-500">{conv.last_message_preview}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[0.7rem] text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              {formatDate(conv.updated_at)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              {conv.message_count} messaggi
                            </span>
                          </div>
                        </div>

                        {!isRenaming && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Tooltip content="Rinomina conversazione">
                              <button
                                className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 opacity-0 transition hover:bg-violet-600/12 hover:text-violet-400 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                                onClick={(e) => startRename(conv, e)}
                                aria-label="Rinomina conversazione"
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                              </button>
                            </Tooltip>
                            {canDeleteConversations && (
                              <Tooltip content="Elimina conversazione">
                                <button
                                  className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 group-hover/conv:opacity-100 max-[900px]:opacity-100"
                                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                                  aria-label="Elimina conversazione"
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Panel footer */}
            <div className="border-t border-white/6 px-8 py-4 max-[480px]:px-5">
              <button
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-[0.85rem] font-medium text-slate-400 transition hover:-translate-y-px hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400"
                onClick={() => {
                  handleNewConversation();
                  closeConversationsPanel();
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Nuova conversazione
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
