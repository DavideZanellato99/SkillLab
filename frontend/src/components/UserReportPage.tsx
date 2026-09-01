/* Il report attività: una riga per persona, e sotto quella riga tutto quello
 * che quella persona ha fatto.
 *
 * La domanda è diversa da quella della dashboard: là si guarda un gruppo e
 * si cerca una media, qui si guarda una persona alla volta e si cerca cosa
 * ha fatto. Per questo le due prove (le conversazioni con gli avatar e le
 * simulazioni) stanno sulla stessa riga: chi ha solo svolto simulazioni, con
 * i soli conteggi delle conversazioni, sembrerebbe fermo.
 *
 * In riga ci sono i conteggi, le prove una per una arrivano quando la riga si
 * apre. Venivano insieme, cioè ogni conversazione e ogni tentativo di ogni
 * persona per aprirne una alla volta, ed era la richiesta più pesante
 * dell'applicazione fatta a ogni cambio di periodo.
 *
 * I voti stanno una riga più sotto, nello storico che si apre: qui la
 * domanda è quanto una persona si è allenata, e una media in tabella la
 * risponderebbe con un numero che riguarda tutt'altro. */

import { Fragment, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import type {
  ConversationReport,
  SimulationAttemptReport,
  UserActivityReport,
} from '../services/admin'
import { useUsersReport } from '../hooks/useReports'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useOrganizations } from '../hooks/useOrganizations'
import {
  isAdmin,
  isSuperAdmin,
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  getInitials,
} from '../services/auth'
import DataTable, { Td, Tr } from './DataTable'
import LoadError from './LoadError'
import PeriodOrgFilters from './PeriodOrgFilters'
import StaleContent from './StaleContent'
import { ChevronDownIcon } from './icons'
import { PageContainer, PageHeader } from './PageLayout'
import TableSkeleton from './TableSkeleton'
import ConversationDetailModal from './ConversationDetailModal'
import type { ConversationDetailTarget } from './ConversationDetailModal'
import DeleteAttemptDialog from './DeleteAttemptDialog'
import DeleteConversationDialog from './DeleteConversationDialog'
import SimulationAttemptModal from './SimulationAttemptModal'
import UserReportDetail from './UserReportDetail'
import { matchesSearch } from './tableSearch'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import { formatDuration } from './reportFormat'
import type { PeriodValue } from './reportFormat'

/** Columns depend on the role: the super admin also sees the organization,
 * an org admin already knows it (its own), so the column is dropped. */
function reportColumns(showOrg: boolean): DataTableColumn<UserActivityReport>[] {
  /* Le percentuali sommano a 100 in entrambi gli assetti: le due colonne dei
   * conteggi restano larghe quanto la loro intestazione, e a cedere spazio
   * all'organizzazione è la colonna dell'utente.
   *
   * Le tre colonne di numeri sono quelle per cui questa tabella esiste: chi
   * si è allenato di più e chi non ha ancora cominciato si trovano ai due
   * capi dello stesso ordinamento, e prima si leggevano riga per riga.
   * Sull'utente si ordina per cognome, che è l'ordine di un elenco di
   * persone: il nome sta scritto prima ma non è quello che si cerca. */
  const conteggi: DataTableColumn<UserActivityReport>[] = [
    {
      key: 'conversazioni',
      label: 'Conversazioni',
      title: 'Conversazioni sostenute nel periodo selezionato',
      width: '',
      sortValue: (u) => u.conversation_count,
    },
    {
      key: 'simulazioni',
      label: 'Simulazioni',
      title: 'Simulazioni consegnate nel periodo selezionato',
      width: '',
      sortValue: (u) => u.simulation_count,
    },
  ]
  const utente: DataTableColumn<UserActivityReport> = {
    key: 'utente',
    label: 'Utente',
    width: showOrg ? '23%' : '33%',
    sortValue: (u) => u.cognome || u.nome || u.email,
  }
  const ruolo: DataTableColumn<UserActivityReport> = {
    key: 'ruolo',
    label: 'Ruolo',
    width: showOrg ? '13%' : '14%',
    sortValue: (u) => ROLE_LABELS[u.ruolo] ?? u.ruolo,
  }
  const durata: DataTableColumn<UserActivityReport> = {
    key: 'durata',
    label: 'Durata',
    width: showOrg ? '13%' : '15%',
    sortValue: (u) => u.total_duration_seconds,
  }
  const dettaglio: DataTableColumn<UserActivityReport> = {
    key: 'dettaglio',
    ariaLabel: 'Dettaglio',
    width: '8%',
  }

  if (showOrg) {
    return [
      utente,
      {
        key: 'organizzazione',
        label: 'Organizzazione',
        width: '15%',
        sortValue: (u) => u.organization_name,
      },
      ruolo,
      { ...conteggi[0], width: '14%' },
      { ...conteggi[1], width: '14%' },
      durata,
      dettaglio,
    ]
  }
  return [
    utente,
    ruolo,
    { ...conteggi[0], width: '15%' },
    { ...conteggi[1], width: '15%' },
    durata,
    dettaglio,
  ]
}

/** Quante prove nel periodo. Zero è un trattino e non uno zero in evidenza:
 * è un'assenza, e non la merita. */
function CountCell({ count }: { count: number }) {
  if (count === 0) return <span className="text-[0.8rem] text-slate-600">—</span>
  return (
    <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
      {count}
    </span>
  )
}

export default function UserReportPage() {
  const { user } = useAuth()
  const showOrg = isSuperAdmin(user)
  const columns = reportColumns(showOrg)
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const [orgFilter, setOrgFilter] = useState('')
  const [period, setPeriod] = useState<PeriodValue>('all')
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)
  const [openConversation, setOpenConversation] = useState<ConversationDetailTarget | null>(null)
  const [deletingConversation, setDeletingConversation] = useState<ConversationReport | null>(null)
  const [deletingAttempt, setDeletingAttempt] = useState<SimulationAttemptReport | null>(null)

  /* Il periodo scelto viaggia fin dentro le prove che si aprono sotto una
     riga: la riga dice "tre conversazioni" e sotto se ne devono aprire tre. */
  const days = period === 'all' ? undefined : Number(period)
  const {
    data: report = [],
    isPending: isLoading,
    isPlaceholderData,
    error,
    refetch,
  } = useUsersReport(orgFilter, days, isAdmin(user))

  /* La ricerca filtra un elenco già in mano, ma è l'elenco intero di un
     tenant: senza attesa, ogni tasto premuto rifiltra e ridisegna la tabella
     mentre si sta ancora scrivendo. È la stessa attesa della gestione
     utenti. */
  const debouncedSearch = useDebouncedValue(search)

  const visibleReport = report.filter((u) =>
    matchesSearch(
      debouncedSearch,
      `${u.nome} ${u.cognome}`,
      u.email,
      u.organization_name ?? '',
      ROLE_LABELS[u.ruolo] ?? u.ruolo,
    ),
  )

  const organizationOptions = organizations.map((o) => ({ value: o.id, label: o.name }))

  /* Azzerare riporta il report intero: tutta la storia, tutte le
     organizzazioni e la ricerca cancellata. Anche quella restringe questo
     stesso elenco, e lasciarla scritta voleva dire premere «Azzera Filtri» e
     continuare a vedere un report filtrato. */
  const resetFilters = () => {
    setPeriod('all')
    setOrgFilter('')
    setSearch('')
  }

  /* L'eliminazione, la sua conferma e cosa va detto prima di premere stanno
   * nei due dialoghi: da qui si dice solo cosa si sta per eliminare. È la
   * stessa conferma che si legge dalla schermata che apre una prova per
   * intero, e la frase che spiega cosa sparisce non va scritta due volte.
   *
   * L'eliminazione invalida i rendiconti, cioè sia questo elenco sia le
   * prove aperte sotto una riga, che si rileggono dal server: prima i
   * conteggi e la durata totale della riga venivano ricalcolati qui a mano,
   * cioè si riscriveva lato client una somma che il server fa già. */

  return (
    /* Larga come il registro attività: la riga di una persona ha già sette
     * colonne, e quello che si apre sotto ne ha altrettante. */
    <PageContainer width="wide">
      <PageHeader
        title="Report Attività"
        description="Attività di ogni persona: le conversazioni con gli avatar e le simulazioni consegnate."
      />

      {/* Periodo e organizzazione sotto l'intestazione, come in ogni altro
          elenco dell'applicazione: sono i filtri che dicono quale report si
          sta guardando, e prima stavano dentro la barra della tabella, cioè
          in un posto che nessun'altra schermata usa. La ricerca resta di là,
          perché cerca dentro l'elenco che questi due hanno già scelto. */}
      <PeriodOrgFilters
        idPrefix="report"
        period={period}
        onPeriodChange={setPeriod}
        organizationOptions={showOrg ? organizationOptions : undefined}
        organizationId={orgFilter}
        onOrganizationChange={showOrg ? setOrgFilter : undefined}
        isSearching={Boolean(search)}
        onReset={resetFilters}
      />

      {error ? (
        /* Con il comando per richiederlo, come nelle finestre che questa
           pagina apre. Prima sotto la fascia rossa restava la tabella vuota,
           che diceva "Nessun utente trovato": una lettura caduta si leggeva
           come un'organizzazione senza nessuno dentro, e per riprovare
           bisognava ricaricare la pagina. */
        <LoadError
          message={error instanceof Error ? error.message : 'Impossibile caricare il report.'}
          variant="page"
          onRetry={() => void refetch()}
          className="py-8"
        />
      ) : isLoading ? (
        <TableSkeleton columns={columns} message="Caricamento report attività..." />
      ) : (
        /* Le righe di prima restano finché non arrivano quelle del periodo
           appena chiesto: dicono ancora di che cosa si sta parlando, e che non
           sono più loro lo dice `StaleContent`, come in ogni altra tabella.
           Prima al loro posto compariva una rotella, cioè la pagina si
           svuotava di tabella, ricerca e filtri a ogni cambio di periodo. */
        <StaleContent isStale={isPlaceholderData}>
          <DataTable
            columns={columns}
            items={visibleReport}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per nome, email, organizzazione o ruolo..."
            emptyMessage={
              debouncedSearch ? 'Nessun utente corrisponde alla ricerca' : 'Nessun utente trovato'
            }
            /* Cambiare periodo, organizzazione o ricerca riporta alla prima
             pagina: restare alla terza di un elenco che non è più quello
             mostrava le righe dalla ventunesima in poi di una domanda che
             nessuno ha fatto. */
            pageResetKey={`${orgFilter}|${period}|${debouncedSearch}`}
            renderRow={(u) => {
              const isExpanded = expandedUserId === u.id
              return (
                <Fragment key={u.id}>
                  {/* `onActivate` e non un `onClick` scritto a mano: aprire la
                    riga è l'unica cosa che questa pagina fa, e con il solo
                    clic chi gira con il tabulatore non aveva nessun modo di
                    farlo. Da lì arrivano il fuoco, Invio e Spazio. */}
                  <Tr
                    hover={!isExpanded}
                    className={isExpanded ? '[&>td]:bg-violet-600/6' : ''}
                    aria-expanded={isExpanded}
                    onActivate={() => setExpandedUserId(isExpanded ? null : u.id)}
                  >
                    {/* Come nella gestione utenti e nella tabella degli avatar:
                      l'intestazione resta al centro, i valori vanno a
                      sinistra, perché un'iniziale, un nome e un'email
                      incolonnati si scorrono con l'occhio. */}
                    <Td align="left">
                      <div className="flex items-center gap-4">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
                          {getInitials(u.nome, u.cognome, u.email)}
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-slate-100">
                            {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                          </span>
                          <span className="truncate text-xs text-slate-500">{u.email}</span>
                        </div>
                      </div>
                    </Td>
                    {showOrg && (
                      <Td>
                        {u.organization_name ? (
                          <span className="text-[0.85rem] text-slate-300">
                            {u.organization_name}
                          </span>
                        ) : (
                          <span className="text-[0.75rem] italic text-slate-500">—</span>
                        )}
                      </Td>
                    )}
                    <Td>
                      <Badge tone={ROLE_BADGE_CLASSES[u.ruolo] ?? ''}>
                        {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                      </Badge>
                    </Td>
                    <Td>
                      <CountCell count={u.conversation_count} />
                    </Td>
                    <Td>
                      <CountCell count={u.simulation_count} />
                    </Td>
                    <Td>
                      <span className="text-[0.85rem] text-slate-400">
                        {formatDuration(u.total_duration_seconds)}
                      </span>
                    </Td>
                    <Td>
                      {/* La freccia dell'app e non una disegnata qui: era la
                        stessa forma ricopiata, e si sarebbe scolorita per
                        conto suo. */}
                      <ChevronDownIcon
                        size={16}
                        className={`inline-block text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </Td>
                  </Tr>

                  {isExpanded && (
                    <tr>
                      {/* Il dettaglio che si apre porta la propria tabella, che
                        centra le proprie colonne da sé: qui il testo torna a
                        sinistra, perché non è una riga di questa. */}
                      <Td colSpan={columns.length} align="left" className="bg-gray-950/40">
                        <UserReportDetail
                          user={u}
                          days={days}
                          /* Quante prove ha in tutto, per non offrire un quadro
                           d'insieme che il server rifiuterebbe. Solo sul
                           periodo "Sempre": su un periodo stretto il conto
                           della riga sono le prove di quella settimana,
                           mentre il quadro le legge tutte, e chi ne aveva
                           venti in un anno si vedeva negare il bottone.
                           Sconosciuto vuol dire mostrarlo e lasciar
                           rispondere il server. */
                          evidenceCount={
                            days === undefined ? u.conversation_count + u.simulation_count : null
                          }
                          onOpenAttempt={setOpenAttemptId}
                          /* La modale della conversazione vuole sapere chi ha
                           parlato con chi: l'intestazione arriva da qui, il
                           resto lo carica lei dall'id. */
                          onOpenConversation={(conversation) =>
                            setOpenConversation({
                              conversation_id: conversation.id,
                              mode: conversation.mode,
                              user_nome: u.nome,
                              user_cognome: u.cognome,
                              user_email: u.email,
                              avatar_name: conversation.avatar_name,
                              conversation_at: conversation.created_at,
                            })
                          }
                          onDeleteConversation={setDeletingConversation}
                          onDeleteAttempt={setDeletingAttempt}
                        />
                      </Td>
                    </tr>
                  )}
                </Fragment>
              )
            }}
          />
        </StaleContent>
      )}

      {openAttemptId && (
        <SimulationAttemptModal
          attemptId={openAttemptId}
          onClose={() => setOpenAttemptId(null)}
          onDeleted={() => setOpenAttemptId(null)}
        />
      )}

      {/* La conversazione per intero: trascrizione, valutazione e la
          revisione che il docente può scrivere di lì. È la stessa schermata
          della dashboard, perché è la stessa cosa che si va a leggere. */}
      {openConversation && (
        <ConversationDetailModal
          row={openConversation}
          onClose={() => setOpenConversation(null)}
          /* Niente `onReviewSaved`: correggere un voto invalida già i
             rendiconti da dentro la mutation, e una query attiva invalidata
             si rilegge da sola. Chiedere anche di qui voleva dire far
             partire due volte la lettura più pesante dell'applicazione. */
          /* Le due prove si possono anche buttare da aperte, ed è lo stesso
             gesto del cestino sulla riga: chi ha appena letto la
             trascrizione è già dentro la conversazione che vuole togliere,
             e non deve richiuderla per cercarne la riga. */
          onDeleted={() => setOpenConversation(null)}
        />
      )}

      {/* Le due conferme di eliminazione, le stesse che si aprono dal
          cestino in testa alle schermate qui sopra. */}
      {deletingConversation && (
        <DeleteConversationDialog
          conversationId={deletingConversation.id}
          avatarName={deletingConversation.avatar_name}
          conversationAt={deletingConversation.created_at}
          onClose={() => setDeletingConversation(null)}
          onDeleted={() => setDeletingConversation(null)}
        />
      )}

      {deletingAttempt && (
        <DeleteAttemptDialog
          attemptId={deletingAttempt.id}
          simulationTitle={deletingAttempt.simulation_title}
          simulationKind={deletingAttempt.simulation_kind}
          attemptedAt={deletingAttempt.created_at}
          onClose={() => setDeletingAttempt(null)}
          onDeleted={() => setDeletingAttempt(null)}
        />
      )}
    </PageContainer>
  )
}
