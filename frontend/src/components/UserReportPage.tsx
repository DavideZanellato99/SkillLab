/* Il report attività: una riga per persona, e su quella riga tutto quello
 * che quella persona ha fatto.
 *
 * La domanda è diversa da quella della dashboard: là si guarda un gruppo e
 * si cerca una media, qui si guarda una persona alla volta e si cerca cosa
 * ha fatto. Per questo le due prove (le conversazioni con gli avatar e le
 * simulazioni) stanno sulla stessa riga: chi ha solo svolto simulazioni, con
 * i soli conteggi delle conversazioni, sembrerebbe fermo.
 *
 * I voti stanno una riga più sotto, nello storico che si apre: qui la
 * domanda è quanto una persona si è allenata, e una media in tabella la
 * risponderebbe con un numero che riguarda tutt'altro. */

import { Fragment, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { ConversationReport, SimulationAttemptReport } from '../services/admin'
import { useUsersReport } from '../hooks/useReports'
import { useOrganizations } from '../hooks/useOrganizations'
import {
  isAdmin,
  isSuperAdmin,
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  getInitials,
} from '../services/auth'
import DataTable, { Td, Tr } from './DataTable'
import Select from './Select'
import FilterTabs from './FilterTabs'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import ConversationDetailModal from './ConversationDetailModal'
import type { ConversationDetailTarget } from './ConversationDetailModal'
import DeleteAttemptDialog from './DeleteAttemptDialog'
import DeleteConversationDialog from './DeleteConversationDialog'
import SimulationAttemptModal from './SimulationAttemptModal'
import UserReportDetail from './UserReportDetail'
import { matchesSearch } from './tableSearch'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import { formatDuration, PERIOD_OPTIONS } from './reportFormat'
import type { PeriodValue } from './reportFormat'

/** Columns depend on the role: the super admin also sees the organization,
 * an org admin already knows it (its own), so the column is dropped. */
function reportColumns(showOrg: boolean): DataTableColumn[] {
  return [
    { key: 'utente', label: 'Utente' },
    ...(showOrg ? [{ key: 'organizzazione', label: 'Organizzazione' } as DataTableColumn] : []),
    { key: 'ruolo', label: 'Ruolo' },
    {
      key: 'conversazioni',
      label: 'Conversazioni',
      align: 'center',
      title: 'Conversazioni sostenute nel periodo selezionato',
    },
    {
      key: 'simulazioni',
      label: 'Simulazioni',
      align: 'center',
      title: 'Simulazioni consegnate nel periodo selezionato',
    },
    { key: 'durata', label: 'Durata', align: 'right' },
    { key: 'dettaglio', ariaLabel: 'Dettaglio' },
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

  const {
    data: report = [],
    isPending: isLoading,
    error,
    refetch,
  } = useUsersReport(orgFilter, period === 'all' ? undefined : Number(period), isAdmin(user))

  const visibleReport = report.filter((u) =>
    matchesSearch(
      search,
      `${u.nome} ${u.cognome}`,
      u.email,
      u.organization_name ?? '',
      ROLE_LABELS[u.ruolo] ?? u.ruolo,
    ),
  )

  const orgFilterOptions = [
    { value: '', label: 'Tutte le organizzazioni' },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ]

  /* L'eliminazione, la sua conferma e cosa va detto prima di premere stanno
   * nei due dialoghi: da qui si dice solo cosa si sta per eliminare. È la
   * stessa conferma che si legge dalla schermata che apre una prova per
   * intero, e la frase che spiega cosa sparisce non va scritta due volte.
   *
   * L'eliminazione invalida il report, che si rilegge dal server: prima i
   * conteggi e la durata totale della riga venivano ricalcolati qui a mano,
   * cioè si riscriveva lato client una somma che il server fa già. */

  return (
    <PageContainer>
      <PageHeader
        title="Report Attività"
        description="Attività di ogni persona: le conversazioni con gli avatar e le simulazioni consegnate."
        actions={
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-slate-400">Periodo</span>
              <FilterTabs<PeriodValue>
                value={period}
                onChange={setPeriod}
                options={[...PERIOD_OPTIONS]}
                ariaLabel="Periodo delle prove svolte"
              />
            </div>
            {showOrg && (
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium tracking-wide text-slate-400"
                  htmlFor="report-org-filter"
                >
                  Organizzazione
                </label>
                <Select
                  id="report-org-filter"
                  className="min-w-[240px]"
                  value={orgFilter}
                  onChange={setOrgFilter}
                  options={orgFilterOptions}
                />
              </div>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error instanceof Error ? error.message : 'Impossibile caricare il report.'}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingState message="Caricamento report attività..." />
      ) : (
        <DataTable
          columns={columns}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, email, organizzazione o ruolo..."
          isEmpty={visibleReport.length === 0}
          emptyMessage={search ? 'Nessun utente corrisponde alla ricerca' : 'Nessun utente trovato'}
        >
          {visibleReport.map((u) => {
            const isExpanded = expandedUserId === u.id
            return (
              <Fragment key={u.id}>
                <Tr
                  hover={!isExpanded}
                  className={`cursor-pointer ${isExpanded ? '[&>td]:bg-violet-600/6' : ''}`}
                  onClick={() => setExpandedUserId(isExpanded ? null : u.id)}
                >
                  <Td>
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
                        <span className="text-[0.85rem] text-slate-300">{u.organization_name}</span>
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
                  <Td align="center">
                    <CountCell count={u.conversation_count} />
                  </Td>
                  <Td align="center">
                    <CountCell count={u.simulation_count} />
                  </Td>
                  <Td align="right">
                    <span className="text-[0.85rem] text-slate-400">
                      {formatDuration(u.total_duration_seconds)}
                    </span>
                  </Td>
                  <Td align="right">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`inline-block text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Td>
                </Tr>

                {isExpanded && (
                  <tr>
                    <Td colSpan={columns.length} className="bg-gray-950/40">
                      <UserReportDetail
                        user={u}
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
          })}
        </DataTable>
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
          /* Correggere un voto di lì cambia il voto che questo elenco sta
             mostrando: senza rileggerlo, il docente corregge e continua a
             vedere il numero di prima. */
          onReviewSaved={() => void refetch()}
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
