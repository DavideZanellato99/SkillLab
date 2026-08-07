import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchAdminEvaluationPdf } from '../services/admin'
import { fetchEvaluationPdf } from '../services/api'
import type { AdminConversationDetail } from '../services/admin'
import type {
  ChatMessage,
  ConversationMode,
  ConversationReview,
  EvaluationCitation,
  MessageAnnotation,
} from '../services/api'
import { estimateCitationSeekMs } from '../services/voice'
import CallRecordingPlayer from './CallRecordingPlayer'
import type { CallRecordingPlayerHandle } from './CallRecordingPlayer'
import ConversationModeBadge from './ConversationModeBadge'
import DeleteConversationDialog from './DeleteConversationDialog'
import EvaluationReport from './EvaluationReport'
import ModalDeleteButton from './ModalDeleteButton'
import PdfDownloadButton from './PdfDownloadButton'
import MessageAnnotationEditor from './MessageAnnotationEditor'
import MessageAnnotationNote from './MessageAnnotationNote'
import MessageEmotions from './MessageEmotions'
import { splitEmotionTag } from './emotionTag'
import LoadingState from './LoadingState'
import ModalShell from './ModalShell'
import { useRecordingInfo } from '../hooks/useRecording'
import { useAdminConversation } from '../hooks/useAdminConversation'
import { useOwnConversationDetail } from '../hooks/useOwnConversationDetail'
import { queryKeys } from '../hooks/queryKeys'
import TrainerReviewNote from './TrainerReviewNote'
import { hasReviewContent } from './trainerReview'
import TrainerReviewPanel from './TrainerReviewPanel'

/* Dettaglio di una conversazione valutata: trascrizione completa a sinistra
 * e valutazione a destra.
 *
 * Lo aprono in due, ed è `scope` a dire chi: un admin dalla tabella della
 * dashboard, e chi ha tenuto la conversazione rileggendola dalla propria
 * chat. La pagina è la stessa apposta, come per i test consegnati: chi
 * corregge deve leggere quello che legge chi è stato corretto. Cambiano solo
 * le quattro cose che dipendono da chi guarda, cioè da dove arrivano i dati,
 * chi compare nell'intestazione, se la revisione si scrive o si legge e
 * basta, e se la conversazione si può buttare via.
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

/** Quel poco che serve per aprire una conversazione: chi ha parlato con chi
 * e quando, cioè l'intestazione. Il resto (trascrizione, valutazione,
 * revisione) lo carica `useAdminConversation` dall'id.
 *
 * Non è più la riga del report valutazioni per intero perché ora ad aprire
 * questa schermata sono in due: la dashboard, che quella riga ce l'ha, e il
 * report attività, che elenca anche le conversazioni mai valutate e una riga
 * di valutazione non ce l'ha proprio. Una `EvaluationReportRow` soddisfa
 * questo tipo così com'è. */
export interface ConversationDetailTarget {
  conversation_id: string
  mode: ConversationMode
  user_nome: string
  user_cognome: string
  user_email: string
  avatar_name: string
  conversation_at: string
}

interface ConversationDetailModalProps {
  row: ConversationDetailTarget
  onClose: () => void
  /** Chi sta guardando: un admin che corregge ("admin", il default) oppure
   *  chi ha tenuto la conversazione e la rilegge ("own"). */
  scope?: 'admin' | 'own'
  /** Una revisione salvata o ritirata cambia il voto della conversazione:
   *  la tabella che ci ha portato qui sta mostrando quello vecchio e va
   *  ricaricata, altrimenti il docente corregge un voto e continua a
   *  leggere il precedente finché non aggiorna la pagina a mano. */
  onReviewSaved?: () => void
  /* La conversazione si può anche buttare via, e il cestino compare solo se
   * chi ci ha portato qui passa questa funzione. È il modo in cui il
   * permesso arriva fin qui: la dashboard e il report attività sono
   * schermate di amministrazione, quindi chi le apre è un super admin o
   * l'organization admin di quella gente, e il server rifiuta comunque una
   * conversazione fuori dalla propria organizzazione. Chi rilegge una
   * conversazione sua non lo passa, e non avrebbe l'endpoint per farlo.
   *
   * Serve a chiudere la schermata su una conversazione che non esiste più:
   * gli elenchi sotto si aggiornano da soli, questa no. */
  onDeleted?: () => void
}

export default function ConversationDetailModal({
  row,
  onClose,
  onReviewSaved,
  onDeleted,
  scope = 'admin',
}: ConversationDetailModalProps) {
  const isOwn = scope === 'own'
  const canDelete = !isOwn && onDeleted !== undefined
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  // Le due letture sono due hook, e uno dei due resta sempre spento: gli
  // hook non si possono chiamare a seconda dei casi, e la query disabilitata
  // non parte.
  const adminDetail = useAdminConversation(isOwn ? null : row.conversation_id)
  const ownDetail = useOwnConversationDetail(isOwn ? row.conversation_id : null)
  const { data: detail, isPending: isLoading, error, refetch } = isOwn ? ownDetail : adminDetail
  const queryClient = useQueryClient()
  const [isEditingReview, setIsEditingReview] = useState(false)

  // ── Citazioni della valutazione → trascrizione e registrazione ──
  const messageNodes = useRef(new Map<string, HTMLDivElement>())
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playerRef = useRef<CallRecordingPlayerHandle>(null)

  // Stessa query (e stessa cache) del player: serve qui per stimare il
  // punto della registrazione in cui cade un messaggio citato.
  const { data: recordingInfo } = useRecordingInfo(row.conversation_id, row.mode === 'voice')

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
      queryClient.setQueryData<AdminConversationDetail>(
        queryKeys.conversations.adminDetail(row.conversation_id),
        (prev) => {
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
        },
      )
    },
    [queryClient, row.conversation_id],
  )

  /* Salvare o ritirare la revisione ricarica il dettaglio: il punteggio
   * corretto cambia anche il voto finale della valutazione accanto, e
   * ricostruirlo a mano qui vorrebbe dire tenere una seconda copia della
   * regola che decide qual è il voto. È un gesto raro e deliberato, il
   * mezzo secondo di ricaricamento non dà fastidio a nessuno. */
  const handleReviewSaved = useCallback(
    (_review: ConversationReview | null) => {
      setIsEditingReview(false)
      void refetch()
      onReviewSaved?.()
    },
    [onReviewSaved, refetch],
  )

  return (
    <ModalShell
      onClose={onClose}
      size="full"
      padding="none"
      layout="column"
      closeLabel="Chiudi dettaglio conversazione"
    >
      {/* La stessa fascia del dettaglio di un test: titolo con i suoi badge,
          la riga di chi e quando sotto, il referto a destra e il bordo che
          stacca tutto da bordo a bordo. Il pr-16 tiene il testo lontano
          dalla X in alto a destra. */}
      <header className="flex items-start justify-between gap-4 border-b border-white/6 px-8 py-5 pr-16">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-xl font-bold text-slate-100">
              Dettaglio conversazione
            </h2>
            <ConversationModeBadge mode={row.mode} />
          </div>
          {/* Il proprio nome non si ripete a chi rilegge una conversazione
              sua, come nel dettaglio di un test consegnato. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="truncate">
              {isOwn ? row.avatar_name : `${userName} con ${row.avatar_name}`}
            </span>
            <span aria-hidden>·</span>
            <span>{formatDateTime(row.conversation_at)}</span>
          </p>
        </div>
        {/* Le due cose che si fanno a una conversazione chiusa: portarsi via
            il referto e buttarla. Il referto compare a caricamento finito,
            perché prima non si sa se una valutazione c'è; il cestino no, che
            una conversazione si elimina anche se non è mai stata valutata,
            ed è proprio quella aperta per sbaglio a finire lì.

            Stanno in testa e non in fondo alla valutazione, che è lunga e
            scorre via. */}
        <div className="flex items-start gap-2">
          {canDelete && (
            <ModalDeleteButton
              label="Elimina conversazione"
              onClick={() => setIsConfirmingDelete(true)}
            />
          )}
          {detail?.evaluation && (
            <PdfDownloadButton
              fetchPdf={() =>
                isOwn
                  ? fetchEvaluationPdf(row.conversation_id)
                  : fetchAdminEvaluationPdf(row.conversation_id)
              }
              fileNameParts={
                isOwn
                  ? ['valutazione', row.avatar_name]
                  : ['valutazione', userName, row.avatar_name]
              }
            />
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-5">
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
              <span>
                {error instanceof Error ? error.message : 'Impossibile caricare la conversazione.'}
              </span>
            </div>
            <button
              className="cursor-pointer rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)]"
              onClick={() => void refetch()}
            >
              Riprova
            </button>
          </div>
        ) : (
          detail && (
            <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
              <section>
                {/* La registrazione sta sopra la trascrizione e non più in
                  testa alla modale: è la stessa conversazione detta a voce,
                  e da aperta sui controlli ha qui lo spazio per allargarsi.
                  Le chiamate ne lasciano una, le chat no. */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className={`${sectionTitleCls} mb-0`}>Conversazione</h3>
                  {row.mode === 'voice' && (
                    <CallRecordingPlayer
                      ref={playerRef}
                      conversationId={row.conversation_id}
                      variant="inline"
                    />
                  )}
                </div>
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
                              {msg.role === 'user' ? (isOwn ? 'Tu' : userName) : row.avatar_name}
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
                          {msg.role === 'user' &&
                            (isOwn ? (
                              annotationsByMessage.has(msg.id) && (
                                <div className="w-full">
                                  <MessageAnnotationNote
                                    annotation={annotationsByMessage.get(msg.id)!}
                                  />
                                </div>
                              )
                            ) : (
                              <div className="w-full">
                                <MessageAnnotationEditor
                                  key={annotationsByMessage.get(msg.id)?.updated_at ?? 'vuota'}
                                  conversationId={row.conversation_id}
                                  messageId={msg.id}
                                  annotation={annotationsByMessage.get(msg.id) ?? null}
                                  onChange={handleAnnotationChange}
                                />
                              </div>
                            ))}
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
                  {!isOwn && !isEditingReview && (
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
                  {!isOwn && isEditingReview && (
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
      </div>

      {/* La conferma sta sopra la schermata da cui è partita: è l'ultima cosa
          comparsa, e la conversazione da cancellare resta lì dietro da
          rileggere finché non si preme. */}
      {isConfirmingDelete && (
        <DeleteConversationDialog
          conversationId={row.conversation_id}
          avatarName={row.avatar_name}
          conversationAt={row.conversation_at}
          elevated
          onClose={() => setIsConfirmingDelete(false)}
          onDeleted={() => {
            setIsConfirmingDelete(false)
            onDeleted?.()
          }}
        />
      )}
    </ModalShell>
  )
}
