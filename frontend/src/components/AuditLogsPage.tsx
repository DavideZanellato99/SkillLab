import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AUDIT_WINDOW_SIZE, useAuditActions, useAuditLogs } from '../hooks/useAuditLogs'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin } from '../services/auth'
import { errorMessage } from '../services/errors'
import AuditLogRow from './AuditLogRow'
import AuditLogsFilters from './AuditLogsFilters'
import { AUDIT_COLUMNS, NO_AUDIT_FILTERS } from './auditFormat'
import type { AuditLogsFiltersValue } from './auditFormat'
import DataTable from './DataTable'
import FormError from './FormError'
import LoadingState from './LoadingState'
import LoadMoreButton from './LoadMoreButton'
import { PageContainer, PageHeader } from './PageLayout'

/* Registro delle attività: ogni azione che modifica qualcosa, di qualunque
 * utente e di qualunque ruolo. Pagina riservata al super admin, il backend
 * risponde 403 a chiunque altro. In sola lettura: il registro non si
 * modifica e non si cancella, scade e basta.
 *
 * Qui c'è solo l'impaginazione: la barra dei filtri sta in AuditLogsFilters,
 * la riga con il suo pannello in AuditLogRow, e come si legge una riga in
 * auditFormat. */

export default function AuditLogsPage() {
  const { user } = useAuth()
  const isSuper = isSuperAdmin(user)
  const { data: organizations = [] } = useOrganizations(isSuper)
  const { data: actions = [] } = useAuditActions(isSuper)

  const [filters, setFilters] = useState<AuditLogsFiltersValue>(NO_AUDIT_FILTERS)
  const changeFilters = useCallback(
    (patch: Partial<AuditLogsFiltersValue>) => setFilters((prev) => ({ ...prev, ...patch })),
    [],
  )

  /* La ricerca sta nella tabella, ma il server la applica a tutto il registro
   * e non alle sole righe già scaricate: aspetta che si smetta di scrivere per
   * non chiedere una finestra per tasto premuto. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  /* Azzerare comprende la ricerca: è un filtro anche lei, e lasciarla scritta
   * voleva dire premere «Azzera Filtri» e continuare a vedere un registro
   * filtrato. */
  const resetFilters = useCallback(() => {
    setSearch('')
    setFilters(NO_AUDIT_FILTERS)
  }, [])

  const hasFilters = Boolean(
    search || filters.action || filters.organizationId || filters.dateFrom || filters.dateTo,
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const actionOptions = useMemo(
    () => actions.map((a) => ({ value: a.key, label: a.label })),
    [actions],
  )
  const organizationOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  )

  /* I filtri fanno parte della chiave di cache: cambiarne uno è una domanda
   * diversa, quindi la finestra riparte da capo invece di sovrascrivere le
   * righe di prima. */
  const {
    logs,
    total,
    isPending: isLoading,
    isPlaceholderData: isStale,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: isLoadingMore,
  } = useAuditLogs({ ...filters, search: debouncedSearch }, isSuper)

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Registro Attività"
        description="Tutte le azioni compiute sulla piattaforma, da qualunque utente e con qualunque ruolo. Il registro è in sola lettura, le righe scadono automaticamente e non possono essere eliminate."
      />

      <AuditLogsFilters
        value={filters}
        actionOptions={actionOptions}
        organizationOptions={organizationOptions}
        isSearching={Boolean(search)}
        onChange={changeFilters}
        onReset={resetFilters}
      />

      {error && (
        <FormError
          message={errorMessage(error, 'Impossibile caricare il registro.')}
          variant="page"
        />
      )}

      {isLoading ? (
        <LoadingState message="Caricamento registro..." />
      ) : (
        /* Mentre arriva la risposta a un filtro nuovo restano a video le righe
           di prima, attenuate: sono ancora quelle vecchie, e `aria-busy` lo
           dice a chi la pagina non la guarda. Sostituirle con il riquadro di
           caricamento faceva sparire la tabella e saltare la pagina a ogni
           tasto premuto nella ricerca. */
        <div aria-busy={isStale} className={`transition-opacity ${isStale ? 'opacity-60' : ''}`}>
          <DataTable
            columns={AUDIT_COLUMNS}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per email, organizzazione, indirizzo o id..."
            /* Cambiare un filtro riporta alla prima pagina: le righe di prima
               restano a video mentre la risposta arriva, e senza questo si
               resterebbe alla quinta pagina di un registro che nel frattempo è
               diventato un altro. */
            pageResetKey={`${filters.action}|${filters.organizationId}|${filters.dateFrom}|${filters.dateTo}|${debouncedSearch}`}
            isEmpty={logs.length === 0}
            emptyMessage={
              hasFilters ? 'Nessuna azione corrisponde ai filtri' : 'Nessuna azione registrata'
            }
            /* Il conteggio della finestra sta dentro la scheda, sotto la barra
               per sfogliare, e solo finché c'è altro da scaricare: quando il
               registro filtrato è tutto qui i due numeri direbbero la stessa
               cosa a un centimetro di distanza, e due numeri così si leggono
               come una contraddizione. */
            footerNote={
              hasNextPage && (
                <>
                  <span className="tabular-nums">
                    Caricate {logs.length} azioni {hasFilters ? 'delle' : 'di'} {total}
                    {hasFilters ? ' che corrispondono ai filtri' : ''}
                  </span>
                  <LoadMoreButton onClick={() => fetchNextPage()} isLoading={isLoadingMore}>
                    {`Carica altre ${Math.min(AUDIT_WINDOW_SIZE, total - logs.length)}`}
                  </LoadMoreButton>
                </>
              )
            }
          >
            {logs.map((log) => (
              <AuditLogRow
                key={log.id}
                log={log}
                isExpanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
              />
            ))}
          </DataTable>
        </div>
      )}
    </PageContainer>
  )
}
