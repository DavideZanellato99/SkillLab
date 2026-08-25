/* La schermata di allenamento con un avatar: la telefonata e la chat scritta
 * sono la stessa simulazione su due canali diversi, e questa pagina le tiene
 * insieme.
 *
 * Qui restano solo le cose che riguardano entrambe: quale conversazione è
 * aperta, i messaggi a schermo, e cosa succede quando una sessione finisce
 * (la valutazione). Il resto vive nei propri file: la colonna di sinistra,
 * la barra in fondo, le bolle, e i tre comportamenti che hanno uno stato
 * loro (la chat scritta, la rinomina, le citazioni della pagella).
 *
 * Il punto delicato è uno solo, ed è il motivo per cui i messaggi stanno
 * qui: durante una sessione viva arrivano prima a schermo e il database
 * insegue, quindi rileggerlo a metà sessione cancellerebbe quello che si sta
 * dicendo. Da qui la pausa sulla sincronizzazione mentre una chiamata o una
 * chat sono in corso. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '../hooks/useAuth'
import { useAvatar } from '../hooks/useAvatars'
import { useCitationNavigation } from '../hooks/useCitationNavigation'
import { useConversationRename } from '../hooks/useConversationRename'
import { useConversation, useConversations, useDeleteConversation } from '../hooks/useConversations'
import { useConversationEvaluation, useEvaluateConversation } from '../hooks/useEvaluation'
import { useRecordingInfo } from '../hooks/useRecording'
import { useTextChat } from '../hooks/useTextChat'
import type { ChatMessage, EvaluationCitation } from '../services/api'
import { getAvatarImageUrl } from '../services/api'
import { isAdmin } from '../services/auth'
import { estimateCitationSeekMs } from '../services/voice'
import type { CallRecordingPlayerHandle } from './CallRecordingPlayer'
import ChatDock from './ChatDock'
import ChatHeader from './ChatHeader'
import ChatMessages from './ChatMessages'
import ChatSidebar from './ChatSidebar'
import ConversationDetailModal from './ConversationDetailModal'
import EvaluationModal from './EvaluationModal'
import ExpandedConversationsPanel from './ExpandedConversationsPanel'
import PathStepNotice from './PathStepNotice'
import { mainContentCls, mainContentProps } from './mainContent'
import { matchesSearch } from './tableSearch'
import TypingIndicator from './TypingIndicator'

const pageCls =
  'flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden [animation-duration:0.3s]'

export default function ChatPage() {
  const { avatarId } = useParams<{ avatarId: string }>()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canDeleteConversations = isAdmin(user)

  const { data: avatar, isError: avatarError } = useAvatar(avatarId)
  const { data: conversations = [] } = useConversations(avatarId)

  /* ?conversation=<id> apre direttamente quella conversazione: è così che la
   * notifica "il docente ha rivisto una tua conversazione" porta sulla
   * conversazione giusta invece che sulla più recente dell'avatar. */
  const requestedConversationId = searchParams.get('conversation')
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(
    requestedConversationId,
  )

  const { data: conversationData, isFetching: isLoadingConversation } =
    useConversation(currentConversationId)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── Valutazione dopo la sessione ──────────────────
  const { data: evaluation } = useConversationEvaluation(currentConversationId)
  const evaluateMutation = useEvaluateConversation()
  const { mutate: runEvaluation } = evaluateMutation
  const [showEvaluation, setShowEvaluation] = useState(false)
  // Rileggere la conversazione: trascrizione e valutazione affiancate, la
  // stessa schermata da cui un docente la corregge.
  const [showDetail, setShowDetail] = useState(false)
  // Vero solo per la modale aperta da una sessione appena finita: lì la
  // conversazione va nominata prima di poterla chiudere.
  const [isPostSession, setIsPostSession] = useState(false)

  // ── Chiamata ──────────────────────────────────────
  const [voiceActive, setVoiceActive] = useState(false)
  // Conversazione chiusa in questa sessione: si sa che è finita prima che il
  // backend abbia finito di scriverlo.
  const [endedConversationId, setEndedConversationId] = useState<string | null>(null)
  const recordingPlayerRef = useRef<CallRecordingPlayerHandle>(null)

  // ── Pannello espanso delle conversazioni ──────────
  // L'elenco nella colonna è stretto: questo mostra le stesse conversazioni
  // con lo spazio per l'anteprima e lo stato di ognuna.
  const [conversationsExpanded, setConversationsExpanded] = useState(false)
  const [conversationSearch, setConversationSearch] = useState('')

  const rename = useConversationRename()
  const deleteConversationMutation = useDeleteConversation()

  /** Una sessione è finita: se qualcuno ha parlato, il valutatore la giudica. */
  const startEvaluation = useCallback(
    (conversationId: string) => {
      setEndedConversationId(conversationId)
      if (!messages.some((m) => m.role === 'user')) return
      setIsPostSession(true)
      setShowEvaluation(true)
      runEvaluation(conversationId)
    },
    [messages, runEvaluation],
  )

  const chat = useTextChat({
    avatarId,
    conversationId: currentConversationId,
    setConversationId: setCurrentConversationId,
    setMessages,
    setError,
    onEnded: startEvaluation,
  })

  /* Sincronizza i messaggi dalla conversazione caricata, ma non mentre una
   * sessione è viva: le battute di una chiamata e le risposte di una chat
   * arrivano prima qui e il database insegue, quindi rileggerlo adesso le
   * cancellerebbe. */
  useEffect(() => {
    if (conversationData?.messages && !voiceActive && !chat.started) {
      setMessages(conversationData.messages)
    }
  }, [conversationData, voiceActive, chat.started])

  /* La dipendenza è `chat.reset` e non `chat`: l'oggetto dell'hook è nuovo a
   * ogni render, la funzione dentro no, e prenderlo intero rifarebbe questi
   * callback di continuo. Vale per tutti quelli qui sotto. */
  const resetChat = chat.reset

  const openConversation = useCallback(
    (conversationId: string) => {
      setCurrentConversationId(conversationId)
      setError(null)
      // La barra in fondo segue la conversazione che si apre, non quella che
      // si lascia
      resetChat()
    },
    [resetChat],
  )

  /* Una seconda notifica sullo stesso avatar cambia solo la query string, e
   * la pagina non viene rimontata: senza questo resterebbe aperta la
   * conversazione di prima. */
  useEffect(() => {
    if (requestedConversationId) {
      setCurrentConversationId(requestedConversationId)
      resetChat()
    }
  }, [requestedConversationId, resetChat])

  const startNewConversation = useCallback(() => {
    setCurrentConversationId(null)
    setMessages([])
    setError(null)
    // Torna alla scelta del canale: chiamata o chat
    resetChat()
  }, [resetChat])

  const closeConversationsPanel = useCallback(() => {
    setConversationsExpanded(false)
    setConversationSearch('')
  }, [])

  // Esc chiude il pannello, a meno che dentro non si stia scrivendo un titolo
  useEffect(() => {
    if (!conversationsExpanded) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !rename.renamingId) closeConversationsPanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [conversationsExpanded, rename.renamingId, closeConversationsPanel])

  const handleDeleteConversation = useCallback(
    (conversationId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      deleteConversationMutation.mutate(conversationId, {
        onSuccess: () => {
          if (currentConversationId === conversationId) startNewConversation()
        },
      })
    },
    [currentConversationId, deleteConversationMutation, startNewConversation],
  )

  // ── Battute della chiamata ────────────────────────

  // Aggiunge una battuta trascritta; segmenti consecutivi dello stesso turno
  // dell'avatar finiscono in una bolla sola
  const handleVoiceTranscript = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (
        msg.role === 'assistant' &&
        last?.role === 'assistant' &&
        typeof last.id === 'string' &&
        last.id.startsWith('voice-')
      ) {
        return [...prev.slice(0, -1), { ...last, content: `${last.content} ${msg.content}` }]
      }
      return [...prev, msg]
    })
  }, [])

  const handleVoiceConversationId = useCallback((id: string) => {
    setCurrentConversationId((prev) => (prev === id ? prev : id))
    setError(null)
  }, [])

  /* Chiusa la chiamata si rilegge dal database e parte la valutazione.
   * Riagganciare chiude il socket da qui, quindi questo scatta mentre il
   * backend sta ancora scrivendo ended_at: la conversazione appena chiusa
   * potrebbe tornare ancora "aperta", e per questo l'id se lo ricorda la
   * pagina invece di aspettare il server. */
  const handleVoiceSessionEnd = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
    if (!currentConversationId) {
      setEndedConversationId(null)
      return
    }
    startEvaluation(currentConversationId)
  }, [queryClient, currentConversationId, startEvaluation])

  // ── Cosa si sa della conversazione aperta ─────────

  /* Il riassunto arriva dall'elenco della colonna, che è già in cache: così
   * scegliendo una conversazione la barra in fondo è subito quella giusta.
   * Leggere ended_at dalla query di dettaglio farebbe invece lampeggiare il
   * pulsante di chiamata per tutto il tempo del caricamento. */
  const currentSummary = conversations.find((conv) => conv.id === currentConversationId)

  /* Un filtro solo per i due posti in cui l'elenco compare, la colonna e il
   * pannello espanso: sono la stessa lista vista da due distanze, e due
   * ricerche separate vorrebbero dire espandere e ritrovarsi davanti tutte
   * le conversazioni dopo averne cercata una. */
  const visibleConversations = conversations.filter((conv) =>
    matchesSearch(conversationSearch, conv.title, conv.last_message_preview),
  )

  /* Finita la conversazione la trascrizione è definitiva: il backend rifiuta
   * di riaprirla, quindi la barra in fondo smette di proporre di
   * continuarla. voiceActive tiene montato VoiceButton mentre la chiamata è
   * viva, e il controllo esplicito sull'id serve perché senza niente
   * selezionato i due id sono entrambi null e risulterebbero uguali. */
  const isConversationClosed =
    !voiceActive &&
    currentConversationId !== null &&
    (endedConversationId === currentConversationId || !!currentSummary?.ended_at)

  // La voce dell'elenco risponde subito quando si cambia conversazione; la
  // query di dettaglio copre quella appena creata da una chiamata, che
  // l'elenco non ha ancora recuperato.
  const currentTitle = currentSummary?.title ?? conversationData?.title ?? null

  /* Canale della conversazione aperta. Chiamata e chat non si mescolano: il
   * backend rifiuta di continuare l'una sull'altra, quindi la barra offre
   * solo quello su cui la conversazione è nata. */
  const currentMode = currentSummary?.mode ?? conversationData?.mode ?? null

  /* chat.started copre la conversazione che si sta scrivendo adesso, di cui
   * le cache possono ancora non sapere id e canale; currentMode copre una
   * conversazione scritta riaperta dall'elenco. */
  const isChatMode = chat.started || currentMode === 'text'

  // Chatta apre sempre una conversazione NUOVA, quindi si offre solo quando
  // non c'è una trascrizione a schermo in attesa di essere continuata.
  const canStartChat = !voiceActive && !isChatMode && currentConversationId === null

  // Le note che il docente ha appuntato su questa trascrizione, indicizzate
  // per messaggio: ognuna si legge sotto la riga di cui parla.
  const annotationsByMessage = useMemo(
    () => new Map((conversationData?.review?.annotations ?? []).map((a) => [a.message_id, a])),
    [conversationData],
  )

  // ── Dalle citazioni della pagella alla trascrizione ──

  const { highlightedMessageId, registerMessageNode, resolveCitation, flashMessage } =
    useCitationNavigation(messages)

  // Stessa query (e stessa cache) del lettore nella barra: serve a stimare
  // il punto della registrazione in cui cade un messaggio citato.
  const { data: recordingInfo } = useRecordingInfo(
    currentConversationId,
    currentMode === 'voice' && isConversationClosed,
  )

  const canPlayCitations =
    currentMode === 'voice' &&
    isConversationClosed &&
    recordingInfo != null &&
    recordingInfo.duration_ms !== null

  // La pastiglia chiude la pagella: la trascrizione da raggiungere sta sotto
  const handleCitationClick = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation)
      if (!message) return
      setShowEvaluation(false)
      flashMessage(message)
    },
    [resolveCitation, flashMessage],
  )

  const handleCitationPlay = useCallback(
    (citation: EvaluationCitation) => {
      const message = resolveCitation(citation)
      if (!message || !recordingInfo) return
      setShowEvaluation(false)
      flashMessage(message)
      const seekMs = estimateCitationSeekMs(recordingInfo, message.created_at)
      if (seekMs !== null) recordingPlayerRef.current?.seekToMs(seekMs)
    },
    [resolveCitation, recordingInfo, flashMessage],
  )

  // ── Chiusura della pagella ────────────────────────

  const closeEvaluation = useCallback(() => {
    setShowEvaluation(false)
    setIsPostSession(false)
    evaluateMutation.reset()
    rename.mutation.reset()
  }, [evaluateMutation, rename.mutation])

  // Dare un nome alla conversazione è ciò che chiude la modale di fine sessione
  const handleSubmitTitle = (title: string) => {
    if (!currentConversationId) return
    rename.mutation.mutate(
      { conversationId: currentConversationId, title },
      {
        onSuccess: () => {
          setShowEvaluation(false)
          setIsPostSession(false)
          evaluateMutation.reset()
        },
      },
    )
  }

  /* Rifare subito lo stesso scenario: conversazione nuova con lo stesso
   * avatar, e per una chat la casella si apre pronta da scrivere (una
   * chiamata aspetta comunque la pressione di Chiama, il microfono non deve
   * partire da una modale). La valutazione successiva porterà i confronti
   * con quella appena letta. */
  const handleRetryScenario = () => {
    const wasText = currentMode === 'text'
    closeEvaluation()
    startNewConversation()
    if (wasText) chat.start()
  }

  // Dopo una sessione la modale offre di sostituire il nome automatico.
  // Senza un id non c'è niente a cui darlo, quindi il campo sparisce.
  const renamableTitle = isPostSession && currentConversationId ? currentTitle : null

  // ── Guardie di rendering ──────────────────────────

  if (!avatar && !avatarError) {
    return (
      <div className={pageCls}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
          <TypingIndicator />
          <p>Caricamento...</p>
        </div>
      </div>
    )
  }

  if (avatarError || !avatar) {
    return (
      <div className={pageCls}>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
          <p className="mb-4 text-base text-red-400">Impossibile caricare i dati dell'avatar.</p>
          <Link
            to="/app"
            className="text-sm text-violet-400 no-underline transition-colors hover:text-slate-100"
          >
            ← Torna alla galleria
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={pageCls} id="chat-page">
      <ChatSidebar
        avatar={avatar}
        conversations={conversations}
        visibleConversations={visibleConversations}
        search={conversationSearch}
        onSearchChange={setConversationSearch}
        currentConversationId={currentConversationId}
        isOpen={sidebarOpen}
        canDelete={canDeleteConversations}
        /* Mentre il pannello espanso è aperto il campo di rinomina appartiene
           a lui: due campi montati si contenderebbero il fuoco. */
        renamingId={conversationsExpanded ? null : rename.renamingId}
        renameValue={rename.renameValue}
        onRenameValueChange={rename.setRenameValue}
        onStartRename={rename.start}
        onCommitRename={rename.commit}
        onCancelRename={rename.cancel}
        onSelect={openConversation}
        onDelete={handleDeleteConversation}
        onNewConversation={startNewConversation}
        onExpand={() => setConversationsExpanded(true)}
      />

      {/* Apre e chiude la colonna su schermo stretto */}
      <button
        className="fixed bottom-8 left-4 z-50 hidden h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/6 bg-gray-900/90 text-slate-100 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-lg transition hover:border-violet-600 hover:bg-violet-600/20 max-[900px]:flex"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Apri o chiudi la barra laterale"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
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

      <main
        {...mainContentProps}
        className={`${mainContentCls} relative flex min-w-0 flex-1 flex-col`}
      >
        <ChatHeader
          avatar={avatar}
          title={currentTitle}
          /* Durante la chiamata la pastiglia sparisce: il voto che porta è
             quello della conversazione precedente. */
          evaluation={voiceActive ? null : (evaluation ?? null)}
          onOpenDetail={() => setShowDetail(true)}
        />

        {/* Se questa conversazione è la tappa di un percorso, l'obiettivo da
            raggiungere sta qui e non solo sulla mappa da cui si è usciti.
            Sotto la testata e non dentro: parla della prova, non di con chi la
            si sta facendo, e non compare quasi mai. */}
        <PathStepNotice kind="avatar" targetId={avatarId} className="mx-8 mt-3 max-[480px]:mx-4" />

        <ChatMessages
          avatar={avatar}
          messages={messages}
          isLoadingConversation={isLoadingConversation}
          isReplying={chat.isSending}
          streamingReplyId={chat.streamingReplyId}
          highlightedMessageId={highlightedMessageId}
          registerMessageNode={registerMessageNode}
          annotationsByMessage={annotationsByMessage}
        />

        {error && (
          <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/8 px-8 py-2 text-[0.82rem] text-red-400">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        <ChatDock
          avatar={avatar}
          avatarId={avatarId}
          conversationId={currentConversationId}
          mode={currentMode}
          isClosed={isConversationClosed}
          isChatMode={isChatMode}
          canStartChat={canStartChat}
          voiceActive={voiceActive}
          recordingPlayerRef={recordingPlayerRef}
          chat={chat}
          onNewConversation={startNewConversation}
          onVoiceConversationId={handleVoiceConversationId}
          onVoiceTranscript={handleVoiceTranscript}
          onVoiceError={setError}
          onVoiceSessionEnd={handleVoiceSessionEnd}
          onVoiceActiveChange={setVoiceActive}
        />

        {/* Rileggere la conversazione: la stessa schermata della dashboard,
            senza i comandi della revisione, che non sono di chi la riceve */}
        {showDetail && currentConversationId && currentMode && (
          <ConversationDetailModal
            scope="own"
            row={{
              conversation_id: currentConversationId,
              mode: currentMode,
              user_nome: user?.nome ?? '',
              user_cognome: user?.cognome ?? '',
              user_email: user?.email ?? '',
              avatar_name: avatar.name,
              conversation_at: conversationData?.created_at ?? new Date().toISOString(),
            }}
            onClose={() => setShowDetail(false)}
          />
        )}

        {showEvaluation && (
          <EvaluationModal
            avatarName={avatar.name}
            evaluation={evaluation ?? null}
            isLoading={evaluateMutation.isPending}
            error={evaluateMutation.error instanceof Error ? evaluateMutation.error.message : null}
            onRetry={() => currentConversationId && runEvaluation(currentConversationId)}
            currentTitle={renamableTitle}
            onSubmitTitle={handleSubmitTitle}
            onCitationClick={handleCitationClick}
            onCitationPlay={canPlayCitations ? handleCitationPlay : undefined}
            onRetryScenario={handleRetryScenario}
            isSavingTitle={rename.mutation.isPending}
            titleError={
              rename.mutation.error instanceof Error ? rename.mutation.error.message : null
            }
            onClose={closeEvaluation}
          />
        )}
      </main>

      {conversationsExpanded && (
        <ExpandedConversationsPanel
          avatarImageUrl={getAvatarImageUrl(avatar.image_url)}
          avatarName={avatar.name}
          conversations={conversations}
          visibleConversations={visibleConversations}
          search={conversationSearch}
          onSearchChange={setConversationSearch}
          currentConversationId={currentConversationId}
          canDelete={canDeleteConversations}
          renamingId={rename.renamingId}
          renameValue={rename.renameValue}
          onRenameValueChange={rename.setRenameValue}
          onStartRename={rename.start}
          onCommitRename={rename.commit}
          onCancelRename={rename.cancel}
          onOpen={(conversationId) => {
            openConversation(conversationId)
            closeConversationsPanel()
          }}
          onDelete={handleDeleteConversation}
          onNewConversation={() => {
            startNewConversation()
            closeConversationsPanel()
          }}
          onClose={closeConversationsPanel}
        />
      )}
    </div>
  )
}
