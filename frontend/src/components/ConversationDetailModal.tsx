import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminConversation } from '../services/admin';
import type { AdminConversationDetail, EvaluationReportRow } from '../services/admin';
import type { ChatMessage, EvaluationCitation } from '../services/api';
import { fetchRecordingInfo, estimateCitationSeekMs } from '../services/voice';
import CallRecordingPlayer from './CallRecordingPlayer';
import type { CallRecordingPlayerHandle } from './CallRecordingPlayer';
import ConversationModeBadge from './ConversationModeBadge';
import EvaluationReport from './EvaluationReport';
import MessageEmotions, { splitEmotionTag } from './MessageEmotions';

/* Dettaglio di una conversazione valutata, aperto dalla tabella della
 * dashboard admin: trascrizione completa a sinistra e valutazione AI (la
 * stessa mostrata all'utente a fine chiamata) a destra.
 *
 * I momenti citati dalla valutazione sono cliccabili: portano la
 * trascrizione sul messaggio citato e, per le chiamate con registrazione,
 * fanno ripartire l'audio dal punto stimato di quel momento. */

/** Quanto resta acceso l'alone sul messaggio raggiunto da una citazione. */
const CITATION_HIGHLIGHT_MS = 2500;

const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';
const sectionTitleCls = 'mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400';

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

interface ConversationDetailModalProps {
  row: EvaluationReportRow;
  onClose: () => void;
}

export default function ConversationDetailModal({ row, onClose }: ConversationDetailModalProps) {
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // ── Citazioni della valutazione → trascrizione e registrazione ──
  const messageNodes = useRef(new Map<string, HTMLDivElement>());
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerRef = useRef<CallRecordingPlayerHandle>(null);

  // Stessa query (e stessa cache) del player: serve qui per stimare il
  // punto della registrazione in cui cade un messaggio citato.
  const { data: recordingInfo } = useQuery({
    queryKey: ['recording-info', row.conversation_id],
    queryFn: () => fetchRecordingInfo(row.conversation_id),
    enabled: row.mode === 'voice',
  });

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  // L'indice della citazione è la posizione (1-based) nella trascrizione
  // valutata, che coincide con l'ordine dei messaggi salvati: l'id resta
  // l'ancora primaria, l'indice il ripiego.
  const resolveCitation = useCallback(
    (citation: EvaluationCitation): ChatMessage | null => {
      if (!detail) return null;
      return (
        detail.messages.find((m) => m.id === citation.message_id) ??
        detail.messages[citation.index - 1] ??
        null
      );
    },
    [detail],
  );

  const flashMessage = useCallback((message: ChatMessage) => {
    messageNodes.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(message.id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedMessageId(null), CITATION_HIGHLIGHT_MS);
  }, []);

  const handleCitationClick = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation);
      if (message) flashMessage(message);
    },
    [resolveCitation, flashMessage],
  );

  const canPlayCitations =
    row.mode === 'voice' && recordingInfo != null && recordingInfo.duration_ms !== null;

  const handleCitationPlay = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation);
      if (!message || !recordingInfo) return;
      flashMessage(message);
      const seekMs = estimateCitationSeekMs(recordingInfo, message.created_at);
      if (seekMs !== null) playerRef.current?.seekToMs(seekMs);
    },
    [resolveCitation, recordingInfo, flashMessage],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchAdminConversation(row.conversation_id);
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossibile caricare la conversazione.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.conversation_id, reloadKey]);

  const userName =
    row.user_nome && row.user_cognome ? `${row.user_nome} ${row.user_cognome}` : row.user_email;

  return (
    <div className={overlayCls} onClick={onClose}>
      <div
        className="relative max-h-[92vh] w-full max-w-[1100px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-10 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button className={modalCloseCls} onClick={onClose} aria-label="Chiudi dettaglio conversazione">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* pr-12 keeps the header clear of the absolutely placed close button */}
        <header className="mb-6 flex items-start justify-between gap-4 pr-12">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
                Dettaglio conversazione
              </h2>
              <ConversationModeBadge mode={row.mode} />
            </div>
            <p className="text-[0.85rem] text-slate-500">
              {userName} con {row.avatar_name} · {formatDateTime(row.conversation_at)}
            </p>
          </div>
          {/* Calls leave an audio recording behind; chats do not */}
          {row.mode === 'voice' && (
            <CallRecordingPlayer
              ref={playerRef}
              conversationId={row.conversation_id}
              variant="inline"
            />
          )}
        </header>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-slate-500">
            <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
            <p className="text-sm">Caricamento conversazione...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex w-full items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
            <button
              className="cursor-pointer rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Riprova
            </button>
          </div>
        ) : detail && (
          <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <section>
              <h3 className={sectionTitleCls}>Conversazione</h3>
              <div className="flex max-h-[62vh] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/6 bg-gray-950/40 p-4">
                {detail.messages.length === 0 ? (
                  <p className="py-8 text-center text-sm italic text-slate-500">
                    Nessun messaggio registrato.
                  </p>
                ) : (
                  detail.messages.map((msg) => {
                    const { text, emotions } =
                      msg.role === 'user'
                        ? splitEmotionTag(msg.content)
                        : { text: msg.content, emotions: [] };
                    return (
                      <div
                        key={msg.id}
                        ref={(node) => {
                          if (node) messageNodes.current.set(msg.id, node);
                          else messageNodes.current.delete(msg.id);
                        }}
                        className={`flex max-w-[85%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}
                      >
                        <div
                          className={`rounded-2xl px-4 py-3 leading-relaxed transition-shadow duration-300 ${
                            msg.role === 'user'
                              ? 'rounded-br-[4px] bg-gradient-to-br from-violet-600 to-violet-700 text-white'
                              : 'rounded-bl-[4px] border border-white/6 bg-slate-800/70 text-slate-100'
                          } ${
                            msg.id === highlightedMessageId
                              ? 'shadow-[0_0_0_2px_rgba(34,211,238,0.7),0_0_24px_rgba(34,211,238,0.35)]'
                              : ''
                          }`}
                        >
                          <span
                            className={`mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide ${
                              msg.role === 'user' ? 'text-white/70' : 'text-violet-400'
                            }`}
                          >
                            {msg.role === 'user' ? userName : row.avatar_name}
                          </span>
                          <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
                          <MessageEmotions emotions={emotions} />
                          <span
                            className={`mt-1 block text-[0.65rem] ${
                              msg.role === 'user' ? 'text-right text-white/70' : 'text-slate-500'
                            }`}
                          >
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section>
              <h3 className={sectionTitleCls}>Valutazione</h3>
              <div className="max-h-[62vh] overflow-y-auto pr-1">
                {detail.evaluation ? (
                  <EvaluationReport
                    evaluation={detail.evaluation}
                    onCitationClick={handleCitationClick}
                    onCitationPlay={canPlayCitations ? handleCitationPlay : undefined}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Nessuna valutazione disponibile per questa conversazione.
                  </p>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
