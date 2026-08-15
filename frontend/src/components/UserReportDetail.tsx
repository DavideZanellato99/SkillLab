/* Quello che si apre sotto la riga di una persona nel report attività: le
 * sue conversazioni con gli avatar da una parte, le sue simulazioni
 * dall'altra, una prova per volta, e il quadro d'insieme nella terza.
 *
 * Due linguette e non una lista sola, come nella dashboard e nel confronto:
 * "come parla" e "cosa sa" sono due domande, e mescolate in una colonna la
 * seconda si leggerebbe come il seguito della prima. Il conteggio sulla
 * linguetta dice da che parte ci sono dati prima di aprirla.
 *
 * La terza è arrivata dopo, e sta accanto alle altre e non sopra: "cosa devo
 * dirgli" è una domanda dello stesso ordine delle prime due, non una
 * conclusione che vale più degli elenchi da cui viene. È anche l'unica senza
 * conteggio, perché non elenca niente: o c'è, o non è ancora stato scritto.
 *
 * Le due righe si comportano allo stesso modo, ed è voluto: si aprono per
 * leggere com'è andata (la valutazione di là, le risposte di qua) e si
 * possono togliere. Una prova cancellabile solo se è una conversazione
 * lascerebbe lì per sempre il test aperto per sbaglio.
 *
 * Accanto alle linguette, tutto a destra, il filtro e la ricerca della prova
 * che si sta guardando: cambiano con la linguetta perché di una conversazione
 * si chiede il canale e di un test il tipo, e sono due domande che non si
 * possono fare all'altra metà.
 *
 * Sta in un file suo perché la pagina descrive già una tabella con i suoi
 * filtri, e questa è la schermata dentro la schermata. */

import { useState } from 'react'
import type {
  ConversationReport,
  SimulationAttemptReport,
  UserActivityReport,
} from '../services/admin'
import { categoryBadgeClasses } from './categoryStyles'
import ConversationModeBadge from './ConversationModeBadge'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import UserDebriefingPanel from './UserDebriefingPanel'
import FilterTabs from './FilterTabs'
import SearchInput from './SearchInput'
import { TrashIcon } from './icons'
import {
  formatScore,
  kindLabel,
  scoreBadgeTone,
  sourceLabel,
  KIND_FILTERS,
} from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import { formatDateTime } from './lastAccess'
import { formatDuration } from './reportFormat'
import { matchesSearch } from './tableSearch'

type Tab = 'conversations' | 'simulations' | 'debriefing'

/* Il conteggio sulla linguetta dice quante prove ci sono nel periodo, e
 * quando un filtro è attivo anche quante ne restano: "12" diventa "3 di 12".
 * Il solo numero grande accanto a tre righe si legge come un errore, e il
 * solo numero piccolo nasconderebbe che sotto quel filtro c'è dell'altro.
 *
 * Vale anche per la linguetta che non si sta guardando: è la verità di
 * quella metà, e dice che di là un filtro è rimasto acceso. */
function tabLabel(name: string, shown: number, total: number): string {
  return shown === total ? `${name} (${total})` : `${name} (${shown} di ${total})`
}

const rowCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-white/3 pr-3 transition hover:border-violet-600/30 hover:bg-violet-600/8'

/* Quello che apre la prova occupa tutta la riga tranne il cestino: si legge
 * com'è andata cliccandola dove capita, e il gesto che cancella resta un
 * bersaglio separato che nessuno colpisce per sbaglio. */
const openCls =
  'flex flex-1 flex-wrap items-center gap-x-6 gap-y-2 cursor-pointer px-4 py-2 text-left min-w-0'

const deleteCls =
  'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400'

/** Il voto di una prova, o un trattino finché non c'è: una conversazione in
 * attesa di giudizio non è uno zero. */
function ScoreTag({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="min-w-[46px] text-right text-xs italic text-slate-500">n.d.</span>
  }
  return (
    <span
      className={`min-w-[46px] rounded-full px-2 py-0.5 text-center text-[0.8rem] font-semibold ${scoreBadgeTone(score)}`}
    >
      {formatScore(score)}
    </span>
  )
}

/* Il clic apre la conversazione per intero, trascrizione e valutazione:
 * qui c'è il voto ma non quello che l'ha prodotto, e il voto da solo non
 * dice a chi corregge dove si è girato male. */
function ConversationRow({
  conversation,
  onOpen,
  onDelete,
}: {
  conversation: ConversationReport
  onOpen: (conversation: ConversationReport) => void
  onDelete: (conversation: ConversationReport) => void
}) {
  return (
    <li className={rowCls}>
      <button type="button" className={openCls} onClick={() => onOpen(conversation)}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ConversationModeBadge mode={conversation.mode} />
          <span className="truncate text-[0.85rem] font-semibold text-slate-100">
            {conversation.title}
          </span>
          <span className="shrink-0 text-slate-700">·</span>
          <span className="truncate text-[0.85rem] text-slate-400">{conversation.avatar_name}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(conversation.avatar_category_color)}`}
          >
            {conversation.avatar_category}
          </span>
        </div>
        <span className="text-xs text-slate-500">{formatDateTime(conversation.created_at)}</span>
        <span className="text-xs text-slate-400">{conversation.message_count} msg</span>
        <span className="min-w-[90px] text-right text-[0.85rem] font-semibold text-cyan-400">
          {formatDuration(conversation.duration_seconds)}
        </span>
        <ScoreTag score={conversation.score} />
      </button>
      <button
        type="button"
        className={deleteCls}
        aria-label="Elimina conversazione"
        onClick={() => onDelete(conversation)}
      >
        <TrashIcon />
      </button>
    </li>
  )
}

/* Il clic apre il tentativo per intero, come nella tabella della dashboard:
 * qui ci sono il voto e i conteggi, le risposte no, e sono quelle il motivo
 * per cui si apre un test già consegnato.
 *
 * Il tipo è scritto per esteso e non nella sola icona: nella tabella della
 * dashboard lo spazio è contato, qui la riga è larga e "scelta multipla" o
 * "risposta aperta" si legge senza passarci sopra col mouse. */
function SimulationRow({
  attempt,
  onOpen,
  onDelete,
}: {
  attempt: SimulationAttemptReport
  onOpen: (attemptId: string) => void
  onDelete: (attempt: SimulationAttemptReport) => void
}) {
  return (
    <li className={rowCls}>
      <button type="button" className={openCls} onClick={() => onOpen(attempt.id)}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SimulationKindBadge kind={attempt.simulation_kind} />
          <SimulationSourceBadge source={attempt.simulation_source} />
          <span className="truncate text-[0.85rem] font-semibold text-slate-100">
            {attempt.simulation_title}
          </span>
        </div>
        <span className="text-xs text-slate-500">{formatDateTime(attempt.created_at)}</span>
        <span className="min-w-[90px] text-right text-xs text-slate-400">
          {attempt.correct_count}/{attempt.question_count} corrette
        </span>
        <ScoreTag score={attempt.score} />
      </button>
      <button
        type="button"
        className={deleteCls}
        aria-label="Elimina tentativo"
        onClick={() => onDelete(attempt)}
      >
        <TrashIcon />
      </button>
    </li>
  )
}

export default function UserReportDetail({
  user,
  onOpenConversation,
  onDeleteConversation,
  onOpenAttempt,
  onDeleteAttempt,
}: {
  user: UserActivityReport
  /* Le due prove si aprono da fuori: le modali sono a schermo intero, e
   * dentro il riquadro della tabella, che sfoca lo sfondo, resterebbero
   * confinate lì. Le conferme di eliminazione stanno lì per lo stesso
   * motivo. */
  onOpenConversation: (conversation: ConversationReport) => void
  onDeleteConversation: (conversation: ConversationReport) => void
  onOpenAttempt: (attemptId: string) => void
  onDeleteAttempt: (attempt: SimulationAttemptReport) => void
}) {
  /* Si apre sulla prova che la persona ha davvero svolto: chi ha solo fatto
   * simulazioni troverebbe altrimenti una linguetta vuota e dovrebbe
   * scoprire da sé che l'altra non lo è. */
  const [tab, setTab] = useState<Tab>(
    user.conversations.length === 0 && user.simulation_attempts.length > 0
      ? 'simulations'
      : 'conversations',
  )
  /* Un filtro e una ricerca per ciascuna prova, e non un paio in comune.
   * Sono due elenchi con due contenuti diversi: una ricerca scritta sulle
   * conversazioni, portata di peso sulle simulazioni, svuoterebbe la lista
   * senza che sia successo niente, e chi passa di là leggerebbe "nessun
   * risultato" come se non ci fosse mai stato nulla. Il canale poi non è
   * nemmeno una domanda che si può fare a un test.
   *
   * Entrambe partono da "tutto": qui si guarda cosa una persona ha fatto, e
   * un filtro già acceso ne nasconderebbe una parte a chi non sa che c'è. */
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [conversationSearch, setConversationSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [simulationSearch, setSimulationSearch] = useState('')

  const isConversations = tab === 'conversations'
  const isDebriefing = tab === 'debriefing'

  /* La prova si cerca con la stessa parola che il badge mostra, come nelle
   * tabelle della dashboard: chi legge "Chat" su una riga si aspetta che
   * scrivere "chat" gliele trovi. */
  const conversations = user.conversations.filter(
    (c) =>
      (modeFilter === 'all' || c.mode === modeFilter) &&
      matchesSearch(
        conversationSearch,
        c.title,
        c.avatar_name,
        c.avatar_category,
        conversationModeLabel(c.mode),
      ),
  )
  const attempts = user.simulation_attempts.filter(
    (a) =>
      (kindFilter === 'all' || a.simulation_kind === kindFilter) &&
      matchesSearch(
        simulationSearch,
        a.simulation_title,
        kindLabel(a.simulation_kind),
        sourceLabel(a.simulation_source),
      ),
  )

  const total = isConversations ? user.conversations.length : user.simulation_attempts.length
  const shown = isConversations ? conversations.length : attempts.length

  /* Niente per il periodo scelto e niente per i filtri sono due notizie
   * diverse: "nessuna conversazione" davanti a una ricerca attiva si legge
   * come un dato sbagliato invece che come la conseguenza di quello che si
   * è appena chiesto. */
  const emptyMessage = isConversations
    ? total === 0
      ? 'Nessuna conversazione nel periodo scelto'
      : 'Nessuna conversazione con questi filtri'
    : total === 0
      ? 'Nessuna simulazione nel periodo scelto'
      : 'Nessuna simulazione con questi filtri'

  return (
    <div className="flex flex-col gap-3">
      {/* Le linguette a sinistra, come si sceglie cosa guardare; il filtro e
          la ricerca di quella prova tutti a destra, e cambiano con lei. */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs<Tab>
          value={tab}
          onChange={setTab}
          ariaLabel="Tipo di prova da consultare"
          options={[
            {
              value: 'conversations',
              label: tabLabel('Conversazioni', conversations.length, user.conversations.length),
            },
            {
              value: 'simulations',
              label: tabLabel('Simulazioni', attempts.length, user.simulation_attempts.length),
            },
            /* Senza conteggio, al contrario delle altre due: non è un
             * elenco che i filtri possono accorciare, è un testo solo. */
            { value: 'debriefing', label: "Quadro d'insieme" },
          ]}
        />

        {/* Il filtro e la ricerca appartengono all'elenco che si sta
            guardando: sul quadro d'insieme non c'è niente da filtrare, e
            lasciarli lì spenti sarebbe un comando che non risponde. */}
        <div className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0">
          {isDebriefing ? null : isConversations ? (
            <>
              <FilterTabs<ModeFilter>
                value={modeFilter}
                onChange={setModeFilter}
                options={MODE_FILTERS}
                ariaLabel="Canale delle conversazioni"
              />
              <SearchInput
                value={conversationSearch}
                onChange={setConversationSearch}
                placeholder="Cerca per titolo, avatar o canale..."
                ariaLabel="Cerca fra le conversazioni"
                className="w-[260px] max-sm:w-full"
              />
            </>
          ) : (
            <>
              <FilterTabs<KindFilter>
                value={kindFilter}
                onChange={setKindFilter}
                options={KIND_FILTERS}
                ariaLabel="Tipo delle simulazioni"
              />
              <SearchInput
                value={simulationSearch}
                onChange={setSimulationSearch}
                placeholder="Cerca per titolo o tipo..."
                ariaLabel="Cerca fra le simulazioni"
                className="w-[260px] max-sm:w-full"
              />
            </>
          )}
        </div>
      </div>

      {isDebriefing ? (
        <UserDebriefingPanel
          userId={user.id}
          userName={user.nome || user.email}
          /* Le prove che il quadro leggerebbe sono tutte quelle della
             persona, non quelle rimaste sotto il periodo scelto in cima
             alla pagina: il periodo restringe cosa si sta guardando, il
             debriefing guarda comunque le ultime prove che esistono. Il
             conto serve solo a non offrire un bottone che il server
             rifiuterebbe, quindi conta le prove del periodo più largo che
             questa schermata conosce. */
          evidenceCount={user.conversation_count + user.simulation_count}
        />
      ) : shown === 0 ? (
        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2">
          {isConversations
            ? conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  onOpen={onOpenConversation}
                  onDelete={onDeleteConversation}
                />
              ))
            : attempts.map((attempt) => (
                <SimulationRow
                  key={attempt.id}
                  attempt={attempt}
                  onOpen={onOpenAttempt}
                  onDelete={onDeleteAttempt}
                />
              ))}
        </ul>
      )}
    </div>
  )
}
