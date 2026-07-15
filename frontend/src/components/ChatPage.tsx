import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { ChatMessage } from '../services/api';
import { getAvatarImageUrl } from '../services/api';
import {
  useAvatar,
  useConversations,
  useConversation,
  useSendMessage,
  useDeleteConversation,
} from '../hooks/useApi';

export default function ChatPage() {
  const { avatarId: rawId } = useParams<{ avatarId: string }>();
  const avatarId = rawId ? parseInt(rawId, 10) : undefined;

  // ── TanStack queries ──────────────────────────────
  const { data: avatar, isError: avatarError } = useAvatar(avatarId);
  const { data: conversations = [] } = useConversations(avatarId);

  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);

  const {
    data: conversationData,
    isFetching: isLoadingConversation,
  } = useConversation(currentConversationId);

  // ── TanStack mutations ────────────────────────────
  const sendMessageMutation = useSendMessage();
  const deleteConversationMutation = useDeleteConversation();

  // ── Local state ───────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isTyping = sendMessageMutation.isPending;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Sync messages from loaded conversation
  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages);
    }
  }, [conversationData]);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load a conversation's messages
  const loadConversation = (conversationId: number) => {
    setCurrentConversationId(conversationId);
    setError(null);
  };

  // Start a new conversation
  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  // Send a message
  const handleSend = () => {
    if (!inputValue.trim() || !avatarId || isTyping) return;

    const userContent = inputValue.trim();
    setInputValue('');
    setError(null);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: userContent,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    sendMessageMutation.mutate(
      { avatarId, content: userContent, conversationId: currentConversationId },
      {
        onSuccess: (response) => {
          if (!currentConversationId) {
            setCurrentConversationId(response.conversation_id);
          }
          // Replace temp message with real ones
          setMessages((prev) => [
            ...prev.slice(0, -1),
            response.user_message,
            response.assistant_message,
          ]);
        },
        onError: (err) => {
          setError(err.message);
          setMessages((prev) => prev.slice(0, -1));
          setInputValue(userContent);
        },
      },
    );
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Delete a conversation
  const handleDeleteConversation = (convId: number, e: React.MouseEvent) => {
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
      <div className="chat-page">
        <div className="chat-loading-full">
          <div className="typing-indicator">
            <span></span><span></span><span></span>
          </div>
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  if (avatarError || !avatar) {
    return (
      <div className="chat-page">
        <div className="chat-loading-full">
          <p className="chat-error-text">Impossibile caricare i dati dell'avatar.</p>
          <Link to="/" className="chat-back-link">← Torna alla Gallery</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page" id="chat-page">
      {/* Sidebar */}
      <aside className={`chat-sidebar${sidebarOpen ? ' open' : ''}`} id="chat-sidebar">
        {/* Avatar Info */}
        <div className="chat-sidebar-avatar">
          <div className="chat-sidebar-avatar-image">
            <img src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
          </div>
          <h2 className="chat-sidebar-avatar-name">{avatar.name}</h2>
          <span className={`chat-sidebar-avatar-category ${avatar.category.toLowerCase()}`}>
            {avatar.category}
          </span>
          <p className="chat-sidebar-avatar-desc">{avatar.description}</p>
        </div>

        {/* New Conversation Button */}
        <button className="chat-new-btn" onClick={handleNewConversation} id="new-conversation-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuova conversazione
        </button>

        {/* Conversations List */}
        <div className="chat-sidebar-conversations">
          <h3 className="chat-sidebar-section-title">Conversazioni</h3>
          {conversations.length === 0 ? (
            <p className="chat-sidebar-empty">Nessuna conversazione ancora.</p>
          ) : (
            <ul className="chat-conversation-list">
              {conversations.map((conv) => (
                <li
                  key={conv.id}
                  className={`chat-conversation-item${currentConversationId === conv.id ? ' active' : ''}`}
                  onClick={() => loadConversation(conv.id)}
                >
                  <div className="chat-conversation-item-content">
                    <span className="chat-conversation-preview">
                      {conv.last_message_preview || 'Nuova conversazione'}
                    </span>
                    <span className="chat-conversation-meta">
                      {formatDate(conv.updated_at)} · {conv.message_count} msg
                    </span>
                  </div>
                  <button
                    className="chat-conversation-delete"
                    onClick={(e) => handleDeleteConversation(conv.id, e)}
                    aria-label="Elimina conversazione"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Back to Gallery */}
        <Link to="/" className="chat-sidebar-back" id="back-to-gallery">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Torna alla Gallery
        </Link>
      </aside>

      {/* Sidebar toggle for mobile */}
      <button
        className="chat-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
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
      <main className="chat-main" id="chat-main">
        {/* Chat Header */}
        <header className="chat-header">
          <div className="chat-header-info">
            <div className="chat-header-avatar">
              <img src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
            </div>
            <div>
              <h2 className="chat-header-name">{avatar.name}</h2>
              <span className="chat-header-status">
                <span className="chat-header-status-dot"></span>
                In personaggio
              </span>
            </div>
          </div>
        </header>

        {/* Messages Area */}
        <div className="chat-messages" id="chat-messages">
          {messages.length === 0 && !isLoadingConversation && (
            <div className="chat-welcome">
              <div className="chat-welcome-avatar">
                <img src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
              </div>
              <h3>Inizia una conversazione con {avatar.name}</h3>
              <p>{avatar.description}</p>
              <div className="chat-welcome-suggestions">
                <button
                  className="chat-suggestion"
                  onClick={() => { setInputValue('Ciao! Raccontami di te.'); inputRef.current?.focus(); }}
                >
                  👋 Ciao! Raccontami di te.
                </button>
                <button
                  className="chat-suggestion"
                  onClick={() => { setInputValue('Quali sono i tuoi poteri?'); inputRef.current?.focus(); }}
                >
                  ⚡ Quali sono i tuoi poteri?
                </button>
                <button
                  className="chat-suggestion"
                  onClick={() => { setInputValue('Raccontami un\'avventura che hai vissuto.'); inputRef.current?.focus(); }}
                >
                  🗺️ Raccontami un'avventura
                </button>
              </div>
            </div>
          )}

          {isLoadingConversation && (
            <div className="chat-loading-messages">
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              key={msg.id}
              className={`chat-message chat-message-${msg.role}`}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              {msg.role === 'assistant' && (
                <div className="chat-message-avatar">
                  <img src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
                </div>
              )}
              <div className="chat-message-bubble">
                <p className="chat-message-content">{msg.content}</p>
                <span className="chat-message-time">{formatTime(msg.created_at)}</span>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="chat-message chat-message-assistant">
              <div className="chat-message-avatar">
                <img src={getAvatarImageUrl(avatar.image_url)} alt={avatar.name} />
              </div>
              <div className="chat-message-bubble typing">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="chat-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Input Area */}
        <div className="chat-input-area" id="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Scrivi un messaggio a ${avatar.name}...`}
              rows={1}
              disabled={isTyping}
              id="chat-input"
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
              id="chat-send-btn"
              aria-label="Invia messaggio"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <p className="chat-input-hint">
            Premi <kbd>Invio</kbd> per inviare · <kbd>Shift+Invio</kbd> per andare a capo
          </p>
        </div>
      </main>
    </div>
  );
}
