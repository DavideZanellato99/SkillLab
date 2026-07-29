import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAdminConversation } from '../services/admin'
import type { AdminConversationDetail, EvaluationReportRow } from '../services/admin'
import type {
  ChatMessage,
  ConversationReview,
  EvaluationCitation,
  MessageAnnotation,
} from '../services/api'
import { fetchRecordingInfo, estimateCitationSeekMs } from '../services/voice'
import CallRecordingPlayer from './CallRecordingPlayer'
import type { CallRecordingPlayerHandle } from './CallRecordingPlayer'
import ConversationModeBadge from './ConversationModeBadge'
import EvaluationReport from './EvaluationReport'
import MessageAnnotationEditor from './MessageAnnotationEditor'
import MessageEmotions, { splitEmotionTag } from './MessageEmotions'
import LoadingState from './LoadingState'
import ModalShell from './ModalShell'
import TrainerReviewNote, { hasReviewContent } from './TrainerReviewNote'
import TrainerReviewPanel from './TrainerReviewPanel'

/* Dettaglio di una conversazione valutata, aperto dalla tabella della
 * dashboard admin: trascrizione completa a sinistra e valutazione AI (la
 * stessa mostrata all'utente a fine chiamata) a destra.
 *
 * I momenti citati dalla valutazione sono cliccabili: portano la
 * trascrizione sul messaggio citato e, per le chiamate con registrazione,
 * fanno ripartire l'audio dal punto stimato di quel momento.
 *
 * È anche il posto in cui il docente lascia il proprio giudizio: una nota
 * sotto ogni messaggio e, in fondo alla valutazione, la revisione con
 * l'eventuale correzione del voto. La scheda in sola lettura dentro
 * EvaluationReport qui è spenta, perché sarebbe il duplicato del pannello
 * con cui la si scrive. */

/** Quanto resta acceso l'alone sul messaggio raggiunto da una citazione. */
const CITATION_HIGHLIGHT_MS = 2500

const sectionTitleCls = 'mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400'

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

interface ConversationDetailModalProps {
  row: EvaluationReportRow
  onClose: () => void
  /** Una revisione salvata o ritirata cambia il voto della conversazione:
   *  la tabella che ci ha portato qui sta mostrando quello vecchio e va
   *  ricaricata, altrimenti il docente corregge un voto e continua a
   *  leggere il precedente finché non aggiorna la pagina a mano. */
  onReviewSaved?: () => void
}

export default function ConversationDetailModal({
  row,
  onClose,
  onReviewSaved,
}: ConversationDetailModalProps) {
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isEditingReview, setIsEditingReview] = useState(false)

  // ── Citazioni della valutazione → trascrizione e registrazione ──
  const messageNodes = useRef(new Map<string, HTMLDivElement>())
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playerRef = useRef<CallRecordingPlayerHandle>(null)

  // Stessa query (e stessa cache) del player: serve qui per stimare il
  // punto della registrazione in cui cade un messaggio citato.
  const { data: recordingInfo } = useQuery({
    queryKey: ['recording-info', row.conversation_id],
    queryFn: () => fetchRecordingInfo(row.conversation_id),
    enabled: row.mode === 'voice',
  })

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    }
  }, [])

  // L'indice della citazione è la posizione (1-based) nella trascrizione
  // valutata, che coincide con l'ordine dei messaggi salvati: l'id resta
  // l'ancora primaria, l'indice il ripiego.
  const resolveCitation = useCallback(
    (citation: EvaluationCitation): ChatMessage | null => {
      if (!detail) return null
      return (
        detail.messages.find((m) => m.id === citation.message_id) ??
        detail.messages[citation.index - 1] ??
        null
      )
    },
    [detail],
  )

  const flashMessage = useCallback((message: ChatMessage) => {
    messageNodes.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedMessageId(message.id)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedMessageId(null), CITATION_HIGHLIGHT_MS)
  }, [])

  const handleCitationClick = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation)
      if (message) flashMessage(message)
    },
    [resolveCitation, flashMessage],
  )

  const canPlayCitations =
    row.mode === 'voice' && recordingInfo != null && recordingInfo.duration_ms !== null

  const handleCitationPlay = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation)
      if (!message || !recordingInfo) return
      flashMessage(message)
      const seekMs = estimateCitationSeekMs(recordingInfo, message.created_at)
      if (seekMs !== null) playerRef.current?.seekToMs(seekMs)
    },
    [resolveCitation, recordingInfo, flashMessage],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setIsLoading(true)
      setError('')
      try {
        const data = await fetchAdminConversation(row.conversation_id)
        if (!cancelled) setDetail(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossibile caricare la conversazione.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [row.conversation_id, reloadKey])

  const userName =
    row.user_nome && row.user_cognome ? `${row.user_nome} ${row.user_cognome}` : row.user_email

  // Le note sono indicizzate per messaggio: la trascrizione le cerca riga
  // per riga, e il server ne garantisce al massimo una per messaggio.
  const annotationsByMessage = new Map<string, MessageAnnotation>(
    (detail?.review?.annotations ?? []).map((a) => [a.message_id, a]),
  )

  /* Una nota salvata o eliminata aggiorna il dettaglio già in memoria invece
   * di far ripartire la fetch: ricaricare tutto rimbalzerebbe lo scroll
   * della trascrizione a ogni annotazione, che è esattamente il gesto che il
   * docente ripete di più. */
  const handleAnnotationChange = useCallback(
    (messageId: string, annotation: MessageAnnotation | null) => {
      setDetail((prev) => {
        if (!prev) return prev
        const previous = prev.review?.annotations ?? []
        const others = previous.filter((a) => a.message_id !== messageId)
        const annotations = annotation ? [...others, annotation] : others
        if (!prev.review) {
          // Prima nota su una conversazione mai revisionata: la risposta del
          // server è la stessa intestazione sintetica che leggerebbe una
          // GET, quindi qui basta ricostruirla con i campi che servono.
          if (!annotation) return prev
          return {
            ...prev,
            review: {
              conversation_id: prev.conversation_id,
              reviewer_name: annotation.reviewer_name,
              summary_note: null,
              override_score: null,
              override_reason: null,
              ai_score_at_review: null,
              is_stale: false,
              annotations,
              created_at: annotation.created_at,
              updated_at: annotation.updated_at,
            },
          }
        }
        return { ...prev, review: { ...prev.review, annotations } }
      })
    },
    [],
  )

  /* Salvare o ritirare la revisione ricarica il dettaglio: il punteggio
   * corretto cambia anche il voto finale della valutazione accanto, e
   * ricostruirlo a mano qui vorrebbe dire tenere una seconda copia della
   * regola che decide qual è il voto. È un gesto raro e deliberato, il
   * mezzo secondo di ricaricamento non dà fastidio a nessuno. */
  const handleReviewSaved = useCallback(
    (_review: ConversationReview | null) => {
      setIsEditingReview(false)
      setReloadKey((k) => k + 1)
      onReviewSaved?.()
    },
    [onReviewSaved],
  )

  return (
    <ModalShell
      onClose={onClose}
      size="full"
      padding="md"
      closeLabel="Chiudi dettaglio conversazione"
    >
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
        <LoadingState variant="modal" message="Caricamento conversazione..." />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="flex w-full items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-px shrink-0 text-red-500"
            >
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
      ) : (
        detail && (
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
                        : { text: msg.content, emotions: [] }
                    return (
                      <div
                        key={msg.id}
                        ref={(node) => {
                          if (node) messageNodes.current.set(msg.id, node)
                          else messageNodes.current.delete(msg.id)
                        }}
                        className={`flex max-w-[85%] flex-col ${msg.role === 'user' ? 'items-end self-end' : 'items-start self-start'}`}
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
                        {/* La nota sta sotto la riga di cui parla: è tutto
                              il senso di annotare un messaggio invece di
                              scrivere una sintesi.

                              Solo sulle battute dell'operatore, come sul
                              server: è lui a essere valutato, e anche
                              l'errore innescato dall'avatar sta nella
                              risposta che non l'ha colto. */}
                        {msg.role === 'user' && (
                          <div className="w-full">
                            <MessageAnnotationEditor
                              key={annotationsByMessage.get(msg.id)?.updated_at ?? 'vuota'}
                              conversationId={row.conversation_id}
                              messageId={msg.id}
                              annotation={annotationsByMessage.get(msg.id) ?? null}
                              onChange={handleAnnotationChange}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </section>

            <section>
              {/* Il comando della revisione vive qui, in un posto fisso:
                    la revisione già scritta si legge dentro il blocco del
                    punteggio, e un riquadro sempre presente in cima alla
                    colonna era, da vuoto, un buco nel punto più visibile. */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className={`${sectionTitleCls} mb-0`}>Valutazione</h3>
                {!isEditingReview && (
                  <button
                    className="cursor-pointer rounded-lg border-none bg-transparent px-2 py-0.5 text-[0.72rem] font-semibold text-violet-300 transition hover:bg-violet-500/15"
                    onClick={() => setIsEditingReview(true)}
                  >
                    {hasReviewContent(detail.review)
                      ? 'Modifica revisione'
                      : '+ Aggiungi revisione'}
                  </button>
                )}
              </div>
              <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto pr-1">
                {isEditingReview && (
                  <TrainerReviewPanel
                    conversationId={row.conversation_id}
                    review={detail.review}
                    aiScore={detail.evaluation?.overall_score ?? null}
                    onSaved={handleReviewSaved}
                    onClose={() => setIsEditingReview(false)}
                  />
                )}
                {detail.evaluation ? (
                  <EvaluationReport
                    evaluation={detail.evaluation}
                    onCitationClick={handleCitationClick}
                    onCitationPlay={canPlayCitations ? handleCitationPlay : undefined}
                  />
                ) : (
                  /* Senza valutazione non c'è blocco punteggio in cui
                       ospitare la revisione: se ne è stata scritta una, va
                       mostrata comunque, altrimenti resterebbe solo nel
                       database. */
                  <div className="rounded-2xl border border-white/6 bg-white/4 py-6">
                    <p className="px-6 text-center text-sm text-slate-500">
                      Nessuna valutazione automatica per questa conversazione.
                    </p>
                    {detail.review && <TrainerReviewNote review={detail.review} />}
                  </div>
                )}
              </div>
            </section>
          </div>
        )
      )}
    </ModalShell>
  )
}
