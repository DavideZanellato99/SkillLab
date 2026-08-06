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
import { useAuth } from '../contexts/AuthContext'
import type { ConversationReport, SimulationAttemptReport } from '../services/admin'
import { useUsersReport } from '../hooks/useReports'
import { useDeleteConversation } from '../hooks/useConversations'
import { useDeleteSimulationAttempt } from '../hooks/useSimulations'
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
import ConfirmModal from './ConfirmModal'
import ConversationDetailModal from './ConversationDetailModal'
import type { ConversationDetailTarget } from './ConversationDetailModal'
import SimulationAttemptModal from './SimulationAttemptModal'
import UserReportDetail from './UserReportDetail'
import { TrashIcon } from './icons'
import { matchesSearch } from './tableSearch'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'
import { kindLabel } from './simulationFormat'
import { formatDateTime } from './lastAccess'
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
      title: 'Quante ne ha avute nel periodo scelto',
    },
    {
      key: 'simulazioni',
      label: 'Simulazioni',
      align: 'center',
      title: 'Quante ne ha consegnate nel periodo scelto',
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
  const deleteMutation = useDeleteConversation()
  const deleteAttemptMutation = useDeleteSimulationAttempt()

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

  /* L'eliminazione invalida il report, che si rilegge dal server: prima i
   * conteggi e la durata totale della riga venivano ricalcolati qui a mano,
   * cioè si riscriveva lato client una somma che il server fa già. */
  const handleConfirmDeleteConversation = async () => {
    if (!deletingConversation) return
    try {
      await deleteMutation.mutateAsync(deletingConversation.id)
      setDeletingConversation(null)
    } catch {
      // Il messaggio resta nella mutation, la modale lo mostra
    }
  }

  const handleConfirmDeleteAttempt = async () => {
    if (!deletingAttempt) return
    try {
      await deleteAttemptMutation.mutateAsync(deletingAttempt.id)
      setDeletingAttempt(null)
    } catch {
      // Il messaggio resta nella mutation, la modale lo mostra
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Report Attività"
        description="Cosa ha fatto ogni persona: le conversazioni con gli avatar e le simulazioni consegnate."
        actions={
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium tracking-wide text-slate-400">Periodo</span>
              <FilterTabs<PeriodValue>
                value={period}
                onChange={setPeriod}
                options={[...PERIOD_OPTIONS]}
                ariaLabel="Periodo di cui vedere le prove svolte"
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
                        onDeleteConversation={(conversation) => {
                          deleteMutation.reset()
                          setDeletingConversation(conversation)
                        }}
                        onDeleteAttempt={(attempt) => {
                          deleteAttemptMutation.reset()
                          setDeletingAttempt(attempt)
                        }}
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
        <SimulationAttemptModal attemptId={openAttemptId} onClose={() => setOpenAttemptId(null)} />
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
        />
      )}

      {/* Modal Conferma Eliminazione Conversazione */}
      {deletingConversation && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Conversazione"
          description={
            <>
              Stai per eliminare la conversazione con{' '}
              <strong className="text-slate-100">{deletingConversation.avatar_name}</strong> del{' '}
              {formatDateTime(deletingConversation.created_at)}, incluse tutte le sue trascrizioni e
              valutazioni. L'operazione non è reversibile.
            </>
          }
          error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleConfirmDeleteConversation}
          onClose={() => setDeletingConversation(null)}
        />
      )}

      {/* Modal Conferma Eliminazione Tentativo. Dice che sparisce il
          tentativo e non la simulazione: la differenza è tutta lì, e chi
          conferma deve saperla prima. */}
      {deletingAttempt && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Tentativo"
          description={
            <>
              Stai per eliminare il tentativo su{' '}
              <strong className="text-slate-100">{deletingAttempt.simulation_title}</strong> (
              {kindLabel(deletingAttempt.simulation_kind).toLowerCase()}) del{' '}
              {formatDateTime(deletingAttempt.created_at)}, con tutte le risposte date e il voto
              preso. La simulazione resta e si può rifare. L'operazione non è reversibile.
            </>
          }
          error={
            deleteAttemptMutation.error instanceof Error
              ? deleteAttemptMutation.error.message
              : undefined
          }
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteAttemptMutation.isPending}
          onConfirm={handleConfirmDeleteAttempt}
          onClose={() => setDeletingAttempt(null)}
        />
      )}
    </PageContainer>
  )
}
