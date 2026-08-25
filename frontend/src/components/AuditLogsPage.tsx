import { Fragment, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { AuditLog } from '../services/auditLogs'
import { useAuditLogs, useAuditActions, AUDIT_WINDOW_SIZE } from '../hooks/useAuditLogs'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin, ROLE_BADGE_CLASSES, ROLE_LABELS } from '../services/auth'
import DataTable, { Td, Tr } from './DataTable'
import Select from './Select'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import type { DataTableColumn } from './DataTable'
import { fieldCls, labelCls } from './Field'
import FormError from './FormError'

/* Registro delle attività: ogni azione che modifica qualcosa, di qualunque
 * utente e di qualunque ruolo. Pagina riservata al super admin, il backend
 * risponde 403 a chiunque altro. In sola lettura: il registro non si
 * modifica e non si cancella, scade e basta. */

/* Le percentuali sommano a 100. La data e ora non va a capo, quindi la sua
 * colonna è tarata sulla riga intera ("31/12/2025, 23:59:59"); l'oggetto si
 * prende quello che avanza perché è l'unica colonna dal contenuto lungo. */
const COLUMNS: DataTableColumn[] = [
  { key: 'quando', label: 'Data e Ora', width: '15%' },
  { key: 'utente', label: 'Utente', width: '20%' },
  { key: 'organizzazione', label: 'Organizzazione', width: '14%' },
  { key: 'azione', label: 'Azione', width: '15%' },
  { key: 'oggetto', label: 'Oggetto', width: '22%' },
  { key: 'esito', label: 'Esito', compact: true, width: '8%' },
  { key: 'dettaglio', ariaLabel: 'Dettaglio', width: '6%' },
]

const dateInputCls =
  'rounded-xl border border-white/6 bg-slate-800/50 px-4 py-2 text-sm text-slate-100 outline-none transition [color-scheme:dark] focus:border-violet-600 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/** Verde se è andata a buon fine, ambra se è stata rifiutata, rosso se il
 * server è andato in errore. */
function statusClasses(status: number): string {
  if (status < 300) return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
  if (status < 500) return 'border-amber-500/25 bg-amber-500/10 text-amber-400'
  return 'border-red-500/25 bg-red-500/10 text-red-300'
}

/** Riassunto di una riga in una frase: quello che l'endpoint ha allegato,
 * altrimenti l'id della risorsa toccata. */
function summarize(log: AuditLog): string {
  if (log.details) {
    const parts = Object.entries(log.details)
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    if (parts.length) return parts.join(' · ')
  }
  return log.resource_id ?? '—'
}

export default function AuditLogsPage() {
  const { user } = useAuth()
  const isSuper = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(isSuper)
  const { data: actions = [] } = useAuditActions(isSuper)
  const [actionFilter, setActionFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  // La ricerca interroga il server, non solo le righe già caricate: senza
  // il rinvio partirebbe una richiesta per ogni tasto premuto.
  const debouncedSearch = useDebouncedValue(search)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  /* I filtri fanno parte della chiave di cache: cambiarne uno è una domanda
   * diversa, quindi la finestra riparte da capo invece di sovrascrivere le
   * righe di prima. */
  const {
    logs,
    total,
    isPending: isLoading,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: isLoadingMore,
  } = useAuditLogs(
    {
      action: actionFilter,
      organizationId: orgFilter,
      dateFrom,
      dateTo,
      search: debouncedSearch,
    },
    isSuper,
  )

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Registro Attività"
        description="Tutte le azioni compiute sulla piattaforma, da qualunque utente e con qualunque ruolo. Il registro è in sola lettura, le righe scadono automaticamente e non possono essere eliminate."
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="audit-action-filter">
            Azione
          </label>
          <Select
            id="audit-action-filter"
            className="min-w-[240px]"
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { value: '', label: 'Tutte le Azioni' },
              ...actions.map((a) => ({ value: a.key, label: a.label })),
            ]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="audit-org-filter">
            Organizzazione
          </label>
          <Select
            id="audit-org-filter"
            className="min-w-[220px]"
            value={orgFilter}
            onChange={setOrgFilter}
            options={[
              { value: '', label: 'Tutte le Organizzazioni' },
              ...organizations.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="audit-date-from">
            Dal
          </label>
          <input
            id="audit-date-from"
            type="date"
            className={dateInputCls}
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="audit-date-to">
            Al
          </label>
          <input
            id="audit-date-to"
            type="date"
            className={dateInputCls}
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {(actionFilter || orgFilter || dateFrom || dateTo) && (
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            onClick={() => {
              setActionFilter('')
              setOrgFilter('')
              setDateFrom('')
              setDateTo('')
            }}
          >
            Azzera Filtri
          </button>
        )}
      </div>

      {error && (
        <FormError
          message={error instanceof Error ? error.message : 'Impossibile caricare il registro.'}
          variant="page"
        />
      )}

      {isLoading ? (
        <LoadingState message="Caricamento registro..." />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per email, organizzazione, percorso o id..."
            isEmpty={logs.length === 0}
            emptyMessage={
              search || actionFilter || orgFilter || dateFrom || dateTo
                ? 'Nessuna azione corrisponde ai filtri.'
                : 'Nessuna azione registrata.'
            }
          >
            {logs.map((log) => {
              const isExpanded = expandedId === log.id
              return (
                <Fragment key={log.id}>
                  <Tr
                    hover={!isExpanded}
                    className={`cursor-pointer ${isExpanded ? '[&>td]:bg-violet-600/6' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <Td>
                      <span className="whitespace-nowrap text-[0.85rem] tabular-nums text-slate-400">
                        {formatDateTime(log.created_at)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-center">
                        <span className="text-[0.85rem] font-semibold text-slate-100">
                          {log.user_email || '—'}
                        </span>
                        {log.user_role && (
                          <span
                            className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[log.user_role] ?? ''}`}
                          >
                            {ROLE_LABELS[log.user_role] ?? log.user_role}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[0.85rem] text-slate-300">
                        {log.organization_name ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[0.85rem] font-medium text-slate-100">
                        {log.action_label}
                      </span>
                    </Td>
                    <Td>
                      <span className="mx-auto line-clamp-1 max-w-[320px] text-[0.8rem] text-slate-400">
                        {summarize(log)}
                      </span>
                    </Td>
                    <Td compact>
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold tabular-nums ${statusClasses(log.status_code)}`}
                      >
                        {log.status_code}
                      </span>
                    </Td>
                    <Td>
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
                      {/* Il pannello che si apre non è una riga di colonne ma
                          un elenco di voci e valori: resta allineato a
                          sinistra, dove un elenco si legge. */}
                      <Td colSpan={COLUMNS.length} align="left" className="bg-gray-950/40">
                        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[0.8rem]">
                          <dt className="text-slate-500">Richiesta</dt>
                          <dd className="break-all font-mono text-slate-300">
                            {log.method} {log.path}
                          </dd>
                          <dt className="text-slate-500">Risorsa</dt>
                          <dd className="break-all font-mono text-slate-300">
                            {log.resource_type ? `${log.resource_type} ` : ''}
                            {log.resource_id ?? '—'}
                          </dd>
                          <dt className="text-slate-500">Indirizzo IP</dt>
                          <dd className="font-mono text-slate-300">{log.client_ip || '—'}</dd>
                          <dt className="text-slate-500">Browser</dt>
                          <dd className="break-all text-slate-400">{log.user_agent || '—'}</dd>
                          {log.details && (
                            <>
                              <dt className="text-slate-500">Dettagli</dt>
                              <dd className="whitespace-pre-wrap break-all font-mono text-slate-300">
                                {JSON.stringify(log.details, null, 2)}
                              </dd>
                            </>
                          )}
                        </dl>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </DataTable>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="tabular-nums">
              {logs.length} di {total} azioni registrate
            </span>
            {hasNextPage && (
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => fetchNextPage()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Spinner variant="button" />
                    Caricamento...
                  </>
                ) : (
                  `Carica altre ${Math.min(AUDIT_WINDOW_SIZE, total - logs.length)}`
                )}
              </button>
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}
