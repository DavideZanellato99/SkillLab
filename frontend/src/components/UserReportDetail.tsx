/* Quello che si apre sotto la riga di una persona nel report attività: le
 * sue conversazioni con gli avatar da una parte, le sue simulazioni
 * dall'altra, una prova per volta, e il quadro d'insieme nella terza.
 *
 * Le prove le legge questo componente, quando la riga si apre, e non
 * arrivano dentro l'elenco: quello porta i conteggi, e le prove di ogni
 * persona ci stavano dentro tutte, cioè si scaricava lo storico di un tenant
 * intero per aprirne una riga alla volta.
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
 * Le prove stanno nella tabella dell'app e non in righe disegnate qui. Erano
 * righe libere, con la data, i conteggi, la durata e il voto uno dietro
 * l'altro: ogni riga li metteva dove capitava a seconda di quanto era lungo
 * il titolo, e per confrontare due prove bisognava rileggerle una a una
 * invece di scorrere una colonna. Le colonne hanno anche un'intestazione, che
 * è l'unico posto dove dire una volta sola cosa sono quei numeri.
 *
 * Le due righe si comportano allo stesso modo, ed è voluto: si aprono per
 * leggere com'è andata (la valutazione di là, le risposte di qua) e si
 * possono togliere. Una prova cancellabile solo se è una conversazione
 * lascerebbe lì per sempre il test aperto per sbaglio.
 *
 * La ricerca e il filtro della prova che si sta guardando stanno nella barra
 * della tabella, cioè dove stanno in tutte le altre schermate: cambiano con
 * la linguetta perché di una conversazione si chiede il canale e di un test
 * il tipo, e sono due domande che non si possono fare all'altra metà.
 *
 * Sta in un file suo perché la pagina descrive già una tabella con i suoi
 * filtri, e questa è la schermata dentro la schermata. */

import { useState } from 'react'
import type {
  ConversationReport,
  SimulationAttemptReport,
  UserActivityReport,
} from '../services/admin'
import { useUserReportDetail } from '../hooks/useReports'
import LoadingState from './LoadingState'
import LoadError from './LoadError'
import { categoryDotClass } from './categoryStyles'
import ConversationModeBadge from './ConversationModeBadge'
import { conversationModeLabel, MODE_FILTERS } from './conversationMode'
import type { ModeFilter } from './conversationMode'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import UserDebriefingPanel from './UserDebriefingPanel'
import DataTable, { Td, Tr } from './DataTable'
import type { DataTableColumn } from './DataTable'
import FilterTabs from './FilterTabs'
import Select from './Select'
import { TrashIcon } from './icons'
import {
  formatScore,
  kindLabel,
  scoreBadgeTone,
  sourceLabel,
  KIND_FILTERS,
} from './simulationFormat'
import type { KindFilter } from './simulationFormat'
import { formatDateTime } from './dateFormat'
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

/* Oltre questo numero di prove l'elenco si impagina. Sotto, il piede della
 * tabella direbbe "da 1 a 3 di 3" e offrirebbe due frecce spente: comandi che
 * non servono dentro una riga che si è appena aperta. */
const PAGINATE_OVER = 10

/* Le colonne delle due prove. Sono diverse perché sono diverse le domande:
 * di una conversazione si guarda quanto è durata e con chi, di un test quante
 * risposte erano giuste. */
/* Le percentuali sommano a 100 in tutte e due. La data non va a capo, quindi
 * la sua colonna è tarata sulla riga intera con l'ora; il titolo si prende
 * quello che avanza, perché è l'unico testo che può essere lungo davvero. */
const CONVERSATION_COLUMNS: DataTableColumn[] = [
  { key: 'canale', label: 'Canale', width: '10%' },
  { key: 'conversazione', label: 'Conversazione', width: '26%' },
  { key: 'avatar', label: 'Avatar', width: '18%' },
  { key: 'data', label: 'Data', width: '14%' },
  {
    key: 'messaggi',
    label: 'Msg',
    compact: true,
    title: 'Messaggi scambiati nella conversazione',
    width: '7%',
  },
  { key: 'durata', label: 'Durata', width: '11%' },
  { key: 'voto', label: 'Voto', compact: true, width: '8%' },
  { key: 'elimina', ariaLabel: 'Elimina', compact: true, width: '6%' },
]

const SIMULATION_COLUMNS: DataTableColumn[] = [
  { key: 'tipo', label: 'Tipo', width: '16%' },
  { key: 'simulazione', label: 'Simulazione', width: '36%' },
  { key: 'data', label: 'Data', width: '16%' },
  {
    key: 'corrette',
    label: 'Corrette',
    compact: true,
    title: 'Risposte giuste sul totale delle domande',
    width: '12%',
  },
  { key: 'voto', label: 'Voto', compact: true, width: '12%' },
  { key: 'elimina', ariaLabel: 'Elimina', compact: true, width: '8%' },
]

/* Le voci delle due tendine sono quelle dei filtri a pulsanti, con "tutto"
 * spostato in cima: in un gruppo di pulsanti sta in fondo perché è il punto
 * di partenza da cui ci si allontana, in una tendina è la prima voce che si
 * cerca quando si vuole tornare indietro. */
const MODE_OPTIONS = [
  { value: 'all', label: 'Tutti i canali' },
  ...MODE_FILTERS.filter((o) => o.value !== 'all'),
]

const KIND_OPTIONS = [
  { value: 'all', label: 'Tutti i tipi' },
  ...KIND_FILTERS.filter((o) => o.value !== 'all'),
]

/* `block` con `w-full` perché il titolo sta al centro della cella: senza, si
 * stringe sul proprio testo e il taglio dei titoli lunghi cadrebbe in un
 * punto diverso a ogni riga. */
const titleCls =
  'block w-full truncate text-center text-[0.85rem] font-semibold text-slate-100 transition group-hover:text-violet-300'

const deleteCls =
  'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400'

/** Il voto di una prova, o un trattino finché non c'è: una conversazione in
 * attesa di giudizio non è uno zero. */
function ScoreTag({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs italic text-slate-500">n.d.</span>
  }
  return (
    <span
      className={`inline-block min-w-[46px] rounded-full px-2 py-0.5 text-center text-[0.8rem] font-semibold ${scoreBadgeTone(score)}`}
    >
      {formatScore(score)}
    </span>
  )
}

/* Il cestino ferma il clic prima che arrivi alla riga: la riga apre la prova,
 * e chi vuole cancellarla non deve vedersela aprire per un istante. */
function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      className={deleteCls}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onDelete()
      }}
    >
      <TrashIcon />
    </button>
  )
}

/* Il clic apre la conversazione per intero, trascrizione e valutazione:
 * qui c'è il voto ma non quello che l'ha prodotto, e il voto da solo non
 * dice a chi corregge dove si è girato male.
 *
 * Si apre da tutta la riga, con il mouse e con il tabulatore: è `onActivate`
 * a portare il fuoco, Invio e Spazio. Il titolo era un pulsante nel pulsante,
 * cioè l'appiglio da tastiera quando la riga rispondeva al solo mouse: adesso
 * sarebbe una seconda fermata del Tab per lo stesso gesto. */
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
    <Tr className="group" onActivate={() => onOpen(conversation)}>
      <Td>
        <ConversationModeBadge mode={conversation.mode} />
      </Td>
      <Td>
        <span className={titleCls}>{conversation.title}</span>
      </Td>
      <Td>
        {/* La categoria dell'avatar è il pallino colorato e la parola sotto
            il nome: è il contorno di chi ha parlato, non una seconda
            targhetta che si contende la riga con quella del canale. */}
        <span className="flex items-center justify-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${categoryDotClass(conversation.avatar_category_color)}`}
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[0.85rem] text-slate-300">
              {conversation.avatar_name}
            </span>
            <span className="truncate text-xs text-slate-500">{conversation.avatar_category}</span>
          </span>
        </span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-xs text-slate-500">
          {formatDateTime(conversation.created_at)}
        </span>
      </Td>
      <Td compact>
        <span className="text-[0.85rem] tabular-nums text-slate-400">
          {conversation.message_count}
        </span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-[0.85rem] font-semibold text-cyan-400">
          {formatDuration(conversation.duration_seconds)}
        </span>
      </Td>
      <Td compact>
        <ScoreTag score={conversation.score} />
      </Td>
      <Td compact>
        <DeleteButton label="Elimina Conversazione" onDelete={() => onDelete(conversation)} />
      </Td>
    </Tr>
  )
}

/* Il clic apre il tentativo per intero, come nella tabella della dashboard:
 * qui ci sono il voto e i conteggi, le risposte no, e sono quelle il motivo
 * per cui si apre un test già consegnato.
 *
 * Il tipo è scritto per esteso e non nella sola icona: nella tabella della
 * dashboard lo spazio è contato, qui il tipo ha una colonna sua e "scelta
 * multipla" o "risposta aperta" si legge senza passarci sopra col mouse. */
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
    <Tr className="group" onActivate={() => onOpen(attempt.id)}>
      <Td>
        <span className="flex items-center justify-center gap-2">
          <SimulationKindBadge kind={attempt.simulation_kind} />
          <SimulationSourceBadge source={attempt.simulation_source} />
        </span>
      </Td>
      <Td>
        <span className={titleCls}>{attempt.simulation_title}</span>
      </Td>
      <Td>
        <span className="whitespace-nowrap text-xs text-slate-500">
          {formatDateTime(attempt.created_at)}
        </span>
      </Td>
      <Td compact>
        <span className="whitespace-nowrap text-[0.85rem] tabular-nums text-slate-400">
          {attempt.correct_count}/{attempt.question_count}
        </span>
      </Td>
      <Td compact>
        <ScoreTag score={attempt.score} />
      </Td>
      <Td compact>
        <DeleteButton label="Elimina Tentativo" onDelete={() => onDelete(attempt)} />
      </Td>
    </Tr>
  )
}

export default function UserReportDetail({
  user,
  days,
  evidenceCount,
  onOpenConversation,
  onDeleteConversation,
  onOpenAttempt,
  onDeleteAttempt,
}: {
  user: UserActivityReport
  /** Il periodo scelto in cima alla pagina, che taglia queste prove come
   *  taglia i conteggi della riga. */
  days?: number
  /** Quante prove ha in tutto la persona, o null quando non si sa: serve
   *  solo al quadro d'insieme, per non offrire un bottone che il server
   *  rifiuterebbe. */
  evidenceCount: number | null
  /* Le due prove si aprono da fuori: le modali sono a schermo intero, e
   * dentro il riquadro della tabella, che sfoca lo sfondo, resterebbero
   * confinate lì. Le conferme di eliminazione stanno lì per lo stesso
   * motivo. */
  onOpenConversation: (conversation: ConversationReport) => void
  onDeleteConversation: (conversation: ConversationReport) => void
  onOpenAttempt: (attemptId: string) => void
  onDeleteAttempt: (attempt: SimulationAttemptReport) => void
}) {
  /* Le prove si leggono qui, aprendo la riga, e non arrivano con l'elenco:
   * la pagina ne mostra una persona alla volta, e portarle tutte voleva dire
   * scaricare le conversazioni e i tentativi di chiunque per aprirne uno.
   * Il periodo è quello scelto in cima, così i conteggi della riga e le
   * prove che si contano qui sotto sono la stessa cosa. */
  const { data: detail, isPending, error, refetch } = useUserReportDetail(user.id, days)

  /* Si apre sulla prova che la persona ha davvero svolto: chi ha solo fatto
   * simulazioni troverebbe altrimenti una linguetta vuota e dovrebbe
   * scoprire da sé che l'altra non lo è. I conteggi arrivano dalla riga, che
   * li ha già: aspettare la lettura vorrebbe dire aprire sulla linguetta
   * sbagliata e spostarsi sotto le mani di chi guarda. */
  const [tab, setTab] = useState<Tab>(
    user.conversation_count === 0 && user.simulation_count > 0 ? 'simulations' : 'conversations',
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
  const conversations = (detail?.conversations ?? []).filter(
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
  const attempts = (detail?.simulation_attempts ?? []).filter(
    (a) =>
      (kindFilter === 'all' || a.simulation_kind === kindFilter) &&
      matchesSearch(
        simulationSearch,
        a.simulation_title,
        kindLabel(a.simulation_kind),
        sourceLabel(a.simulation_source),
      ),
  )

  /* Quante prove ci sono in tutto: dalla riga finché la lettura non è
   * arrivata, così le linguette portano subito il numero che la riga mostra
   * invece di partire da zero e saltare al valore vero. */
  const conversationsTotal = detail ? detail.conversations.length : user.conversation_count
  const attemptsTotal = detail ? detail.simulation_attempts.length : user.simulation_count
  const conversationsShown = detail ? conversations.length : conversationsTotal
  const attemptsShown = detail ? attempts.length : attemptsTotal

  const total = isConversations ? conversationsTotal : attemptsTotal
  const shown = isConversations ? conversationsShown : attemptsShown

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
      {/* Le linguette da sole sulla loro riga: si sceglie cosa guardare, e
          poi si guarda. Il filtro e la ricerca di quella prova stanno più
          sotto, nella barra della tabella che sono lì per restringere. */}
      <FilterTabs<Tab>
        value={tab}
        onChange={setTab}
        ariaLabel="Tipo di prova da consultare"
        options={[
          {
            value: 'conversations',
            label: tabLabel('Conversazioni', conversationsShown, conversationsTotal),
          },
          {
            value: 'simulations',
            label: tabLabel('Simulazioni', attemptsShown, attemptsTotal),
          },
          /* Senza conteggio, al contrario delle altre due: non è un
           * elenco che i filtri possono accorciare, è un testo solo. */
          { value: 'debriefing', label: "Quadro d'insieme" },
        ]}
      />

      {isDebriefing ? (
        <UserDebriefingPanel
          userId={user.id}
          userName={user.nome || user.email}
          /* Le prove che il quadro leggerebbe sono tutte quelle della
             persona, non quelle rimaste sotto il periodo scelto in cima
             alla pagina: il periodo restringe cosa si sta guardando, il
             debriefing guarda comunque le ultime prove che esistono. Per
             questo il conto arriva da qui solo quando il periodo è "Sempre",
             e negli altri casi è sconosciuto: contando le prove di una
             settimana si negava il quadro a chi ne ha venti in un anno. */
          evidenceCount={evidenceCount}
        />
      ) : error ? (
        /* La lettura delle prove è caduta, e il resto della pagina è ancora
           lì: si riprova senza richiudere la riga. */
        <LoadError
          message={error instanceof Error ? error.message : 'Impossibile caricare le prove.'}
          onRetry={() => void refetch()}
          className="py-6"
        />
      ) : isPending ? (
        <LoadingState message="Caricamento delle prove svolte..." variant="modal" />
      ) : (
        /* Una tabella per linguetta, e non una che cambia colonne sotto le
           mani: passando da una prova all'altra la pagina aperta e la
           ricerca in corso sono quelle dell'altra metà. */
        <DataTable
          key={tab}
          columns={isConversations ? CONVERSATION_COLUMNS : SIMULATION_COLUMNS}
          searchValue={isConversations ? conversationSearch : simulationSearch}
          onSearchChange={isConversations ? setConversationSearch : setSimulationSearch}
          searchPlaceholder={
            isConversations ? 'Cerca per titolo, avatar o canale...' : 'Cerca per titolo o tipo...'
          }
          searchActions={
            isConversations ? (
              <Select
                ariaLabel="Canale delle conversazioni"
                className="w-[180px]"
                value={modeFilter}
                onChange={(value) => setModeFilter(value as ModeFilter)}
                options={MODE_OPTIONS}
              />
            ) : (
              <Select
                ariaLabel="Tipo delle simulazioni"
                className="w-[180px]"
                value={kindFilter}
                onChange={(value) => setKindFilter(value as KindFilter)}
                options={KIND_OPTIONS}
              />
            )
          }
          paginate={total > PAGINATE_OVER}
          /* Cambiare filtro o ricerca riporta alla prima pagina: restare
             alla terza di un elenco che non è più quello vuol dire guardare
             righe che non rispondono a niente. */
          pageResetKey={
            isConversations
              ? `${modeFilter}|${conversationSearch}`
              : `${kindFilter}|${simulationSearch}`
          }
          isEmpty={shown === 0}
          emptyMessage={emptyMessage}
        >
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
        </DataTable>
      )}
    </div>
  )
}
