import { Fragment, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import type { ConversationReport } from '../services/admin'
import { useUsersReport } from '../hooks/useReports'
import { useDeleteConversation } from '../hooks/useConversations'
import { useOrganizations } from '../hooks/useOrganizations'
import {
  isAdmin,
  isSuperAdmin,
  ROLE_LABELS,
  ROLE_BADGE_CLASSES,
  getInitials,
} from '../services/auth'
import { categoryBadgeClasses } from './categoryStyles'
import ConversationModeBadge from './ConversationModeBadge'
import DataTable, { Td, Tr } from './DataTable'
import Select from './Select'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import ConfirmModal from './ConfirmModal'
import { TrashIcon } from './icons'
import { matchesSearch } from './tableSearch'
import type { DataTableColumn } from './DataTable'
import Badge from './Badge'

interface DeletingConversation {
  userId: string
  conversation: ConversationReport
}

/** Columns depend on the role: the super admin also sees the organization,
 * an org admin already knows it (its own), so the column is dropped. */
function reportColumns(showOrg: boolean): DataTableColumn[] {
  return [
    { key: 'utente', label: 'Utente' },
    { key: 'email', label: 'Email' },
    ...(showOrg ? [{ key: 'organizzazione', label: 'Organizzazione' } as DataTableColumn] : []),
    { key: 'ruolo', label: 'Ruolo' },
    { key: 'conversazioni', label: 'Conversazioni', align: 'center' },
    { key: 'durata', label: 'Durata Totale', align: 'right' },
    { key: 'dettaglio', ariaLabel: 'Dettaglio' },
  ]
}

/** "1 h 05 min", "12 min 34 s", "45 s" — "—" for zero/unknown durations */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`
  return `${s} s`
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function UserReportPage() {
  const { user } = useAuth()
  const showOrg = isSuperAdmin(user)
  const columns = reportColumns(showOrg)
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const [orgFilter, setOrgFilter] = useState('')
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingConversation, setDeletingConversation] = useState<DeletingConversation | null>(
    null,
  )

  const {
    data: report = [],
    isPending: isLoading,
    error,
  } = useUsersReport(orgFilter, isAdmin(user))
  const deleteMutation = useDeleteConversation()

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
      await deleteMutation.mutateAsync(deletingConversation.conversation.id)
      setDeletingConversation(null)
    } catch {
      // Il messaggio resta nella mutation, la modale lo mostra
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Report Attività"
        description="Recap in sola lettura degli utenti, delle loro conversazioni con gli avatar e delle durate."
        actions={
          showOrg && (
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
          )
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
          emptyMessage={
            search ? 'Nessun utente corrisponde alla ricerca.' : 'Nessun utente trovato.'
          }
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
                      <span className="font-semibold text-slate-100">
                        {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-slate-400">{u.email}</span>
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
                    <span className="inline-block min-w-8 rounded-full border border-white/6 bg-white/4 px-2 py-0.5 text-[0.8rem] font-semibold text-slate-100">
                      {u.conversation_count}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-semibold text-cyan-400">
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
                      {u.conversations.length === 0 ? (
                        <p className="py-4 text-center text-[0.85rem] italic text-slate-500">
                          Nessuna conversazione registrata per questo utente.
                        </p>
                      ) : (
                        <ul className="flex list-none flex-col gap-2">
                          {u.conversations.map((conv) => (
                            <li
                              key={conv.id}
                              className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/6 bg-white/3 px-4 py-2"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <ConversationModeBadge mode={conv.mode} />
                                <span className="truncate text-[0.85rem] font-semibold text-slate-100">
                                  {conv.title}
                                </span>
                                <span className="shrink-0 text-slate-700">·</span>
                                <span className="truncate text-[0.85rem] text-slate-400">
                                  {conv.avatar_name}
                                </span>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest ${categoryBadgeClasses(conv.avatar_category)}`}
                                >
                                  {conv.avatar_category}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">
                                {formatDateTime(conv.created_at)}
                              </span>
                              <span className="text-xs text-slate-400">
                                {conv.message_count} msg
                              </span>
                              <span className="min-w-[90px] text-right text-[0.85rem] font-semibold text-cyan-400">
                                {formatDuration(conv.duration_seconds)}
                              </span>
                              <button
                                type="button"
                                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                                aria-label="Elimina conversazione"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteMutation.reset()
                                  setDeletingConversation({ userId: u.id, conversation: conv })
                                }}
                              >
                                <TrashIcon />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </DataTable>
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
              <strong className="text-slate-100">
                {deletingConversation.conversation.avatar_name}
              </strong>{' '}
              del {formatDateTime(deletingConversation.conversation.created_at)}, incluse tutte le
              sue trascrizioni e valutazioni. L'operazione non è reversibile.
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
    </PageContainer>
  )
}
