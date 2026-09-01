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
import type { SortState } from './DataTable'
import FormError from './FormError'
import LoadError from './LoadError'
import LoadMoreButton from './LoadMoreButton'
import { PageContainer, PageHeader } from './PageLayout'
import StaleContent from './StaleContent'
import TableSkeleton from './TableSkeleton'

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

  /* Su cosa il registro è ordinato. Vuoto vuol dire l'ordine con cui un
   * registro si legge, le ultime azioni per prime, ed è il server a
   * riportarlo: la tabella qui ha in mano una finestra sola. */
  const [sort, setSort] = useState<SortState | null>(null)

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
    refetch,
  } = useAuditLogs(
    { ...filters, search: debouncedSearch, sort: sort?.key, direction: sort?.direction },
    isSuper,
  )

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

      {/* Un rinfresco caduto con le righe già a schermo si dice e basta:
          quelle restano buone. Quando invece non c'è niente a video l'errore
          prende il posto della tabella e porta il comando per riprovare, che
          una tabella vuota direbbe che non è stata registrata nessuna
          azione. */}
      {error && logs.length > 0 && (
        <FormError
          message={errorMessage(error, 'Impossibile caricare il registro.')}
          variant="page"
        />
      )}

      {error && logs.length === 0 ? (
        <LoadError
          message={errorMessage(error, 'Impossibile caricare il registro.')}
          variant="page"
          onRetry={() => void refetch()}
          className="py-8"
        />
      ) : isLoading ? (
        <TableSkeleton columns={AUDIT_COLUMNS} message="Caricamento registro..." />
      ) : (
        /* Mentre arriva la risposta a un filtro nuovo restano a video le righe
           di prima: come si vede che sono ancora quelle vecchie lo dice
           `StaleContent`, per tutte le tabelle allo stesso modo. */
        <StaleContent isStale={isStale}>
          <DataTable
            columns={AUDIT_COLUMNS}
            items={logs}
            /* L'ordinamento arriva da fuori e torna a chi legge il registro:
               la tabella lo disegna e basta, perché ordinare le righe che ha
               vorrebbe dire ordinare le duecento già scaricate e chiamarle le
               prime duecento di tutte. */
            sort={sort}
            onSortChange={setSort}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per email, organizzazione, indirizzo o id..."
            /* Cambiare un filtro riporta alla prima pagina: le righe di prima
               restano a video mentre la risposta arriva, e senza questo si
               resterebbe alla quinta pagina di un registro che nel frattempo è
               diventato un altro. */
            pageResetKey={`${filters.action}|${filters.organizationId}|${filters.dateFrom}|${filters.dateTo}|${debouncedSearch}`}
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
            renderRow={(log) => (
              <AuditLogRow
                key={log.id}
                log={log}
                isExpanded={expandedId === log.id}
                onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
              />
            )}
          />
        </StaleContent>
      )}
    </PageContainer>
  )
}
