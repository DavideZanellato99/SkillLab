import { useState } from 'react'
import { useAdminSimulations, useDeleteSimulation } from '../hooks/useSimulations'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin } from '../services/auth'
import type { AdminSimulation } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import TableSkeleton from './TableSkeleton'
import DataTable, { Td, Tr } from './DataTable'
import type { DataTableColumn } from './DataTable'
import PrimaryButton from './PrimaryButton'
import Badge from './Badge'
import ConfirmModal from './ConfirmModal'
import Tooltip from './Tooltip'
import { PencilIcon, PlusIcon, TrashIcon } from './icons'
import { ALL_KINDS, filterAdminSimulations, NO_ADMIN_FILTERS } from './simulationFilters'
import type { AdminSimulationFilters } from './simulationFilters'
import SimulationCreateModal from './SimulationCreateModal'
import SimulationDetailModal from './SimulationDetailModal'
import SimulationEditorModal from './SimulationEditorModal'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import SimulationsFilters from './SimulationsFilters'
import { formatDate } from './dateFormat'
import { kindLabel, statusBadgeTone, statusLabel } from './simulationFormat'
import { iconActionCls as actionBtnCls } from './IconButton'

/* La gestione delle simulazioni tecniche, per entrambi i ruoli di
 * amministrazione.
 *
 * La tabella si legge come quelle di utenti, organizzazioni e avatar: il clic
 * sulla riga apre la scheda di sola lettura, la matita apre il pannello in cui
 * si generano le domande, si rileggono, si correggono e si pubblica. Il ciclo
 * di vita sta tutto in quel pannello perché è una cosa sola, non cinque
 * schermate.
 *
 * È la stessa pagina per tutti e due i ruoli, e la sola differenza è
 * l'organizzazione: il super admin la legge in colonna e la sceglie quando ne
 * crea una, un organization admin ha solo la propria e quelle due cose gli
 * direbbero sempre la stessa parola. A confinarlo è il server. */

/** Le colonne dipendono dal ruolo: l'organizzazione la vede solo chi ne
 * amministra più di una. Le percentuali sommano a 100 in entrambi gli
 * assetti, e quando l'organizzazione entra lo spazio lo cede il titolo: è
 * l'unica colonna che può accorciarsi senza spezzare quello che contiene. */
function simulationColumns(showOrg: boolean): DataTableColumn<AdminSimulation>[] {
  /* Le stesse chiavi negli stessi ordini nei due assetti, così le colonne
     comuni si ordinano allo stesso modo per chiunque le guardi. Sul tipo e
     sullo stato si ordina per l'etichetta letta, non per il codice salvato. */
  const title: DataTableColumn<AdminSimulation> = {
    key: 'title',
    label: 'Simulazione',
    width: showOrg ? '21%' : '27%',
    sortValue: (s) => s.title,
  }
  /* Nella colonna del tipo stanno due targhette una di fianco all'altra, e
     "Scelta multipla" è la più lunga delle quattro etichette: la colonna è
     larga perché le due ci stiano in fila, con il padding stretto delle
     colonne compatte. Andando a capo si leggevano come due informazioni su
     due righe, e alzavano ogni riga della tabella. */
  const kind: DataTableColumn<AdminSimulation> = {
    key: 'kind',
    label: 'Tipo',
    compact: true,
    width: showOrg ? '18%' : '20%',
    sortValue: (s) => kindLabel(s.kind),
  }
  const questions: DataTableColumn<AdminSimulation> = {
    key: 'questions',
    label: 'Domande',
    compact: true,
    width: showOrg ? '9%' : '10%',
    sortValue: (s) => s.question_count,
  }
  const status: DataTableColumn<AdminSimulation> = {
    key: 'status',
    label: 'Stato',
    width: showOrg ? '13%' : '14%',
    sortValue: (s) => statusLabel(s.status),
  }
  const created: DataTableColumn<AdminSimulation> = {
    key: 'creazione',
    label: 'Data Creazione',
    width: showOrg ? '12%' : '13%',
    sortValue: (s) => s.created_at,
  }
  const actions: DataTableColumn<AdminSimulation> = {
    key: 'actions',
    label: 'Azioni',
    width: showOrg ? '13%' : '16%',
  }

  if (showOrg) {
    return [
      title,
      {
        key: 'organization',
        label: 'Organizzazione',
        width: '14%',
        sortValue: (s) => s.organization_name,
      },
      kind,
      questions,
      status,
      created,
      actions,
    ]
  }
  return [title, kind, questions, status, created, actions]
}

/* Cosa dice la tabella vuota, che non è sempre la stessa cosa: senza righe
 * per via di un filtro, il messaggio deve dire quale, altrimenti "nessuna
 * simulazione presente" fa credere che siano sparite. */
function emptyMessage(search: string, { status, kind, source }: AdminSimulationFilters): string {
  if (search) return 'Nessuna simulazione corrisponde alla ricerca'
  /* Con più di una tendina scelta il messaggio non dice quale ha svuotato la
     tabella: le vede scritte sopra chi legge, e ripeterle in una frase non
     aiuterebbe comunque a capire quale allargare. */
  const chosen = [status !== 'all', kind !== ALL_KINDS, source !== 'all'].filter(Boolean).length
  if (chosen > 1) return 'Nessuna simulazione corrisponde ai filtri'
  if (status === 'draft') return 'Nessuna bozza da finire'
  if (status === 'published') return 'Nessuna simulazione pubblicata'
  if (kind !== ALL_KINDS) return `Nessuna simulazione di tipo ${kindLabel(kind).toLowerCase()}`
  if (source === 'ai') return 'Nessuna simulazione con domande generate dal modello'
  if (source === 'manual') return 'Nessuna simulazione con domande scritte a mano'
  return 'Nessuna simulazione presente'
}

export default function SimulationAdminPage() {
  const { user } = useAuth()
  const showOrg = isSuperAdmin(user)
  const columns = simulationColumns(showOrg)

  const { data: simulations = [], isLoading } = useAdminSimulations()
  const { data: organizations = [] } = useOrganizations(showOrg)
  const remove = useDeleteSimulation()

  /* La casella scrive subito, il filtro aspetta: sotto c'è il catalogo di
   * test del tenant, riscorso da capo a ogni tasto premuto. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  /* Le tre domande di chi apre questa pagina: che lavoro siano questi test,
   * chi ne ha scritto le domande e quali siano ancora da finire. Si parte
   * dall'elenco intero, con le tre tendine sul valore che non restringe. */
  const [filters, setFilters] = useState<AdminSimulationFilters>(NO_ADMIN_FILTERS)
  const [creating, setCreating] = useState(false)
  /* Il pannello di revisione, aperto dalla matita. Tiene l'id e non la riga
   * perché si ricarica dal server: le domande non stanno nell'elenco. */
  const [openId, setOpenId] = useState<string | null>(null)
  /* Dettaglio in sola lettura, aperto dal clic sulla riga come nelle tabelle
   * di utenti, organizzazioni e avatar. */
  const [viewing, setViewing] = useState<AdminSimulation | null>(null)
  const [toDelete, setToDelete] = useState<AdminSimulation | null>(null)

  const filtered = filterAdminSimulations(simulations, filters, debouncedSearch, showOrg)

  const changeFilters = (patch: Partial<AdminSimulationFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }))

  /* Azzerare i filtri svuota anche la casella di ricerca: chi lo preme
     vuole rivedere l'elenco intero, e restringerlo ancora per una parola
     scritta prima sarebbe la stessa tabella filtrata di un attimo fa. */
  const resetFilters = () => {
    setSearch('')
    setFilters(NO_ADMIN_FILTERS)
  }

  const confirmDelete = () => {
    if (!toDelete) return
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        if (openId === toDelete.id) setOpenId(null)
        if (viewing?.id === toDelete.id) setViewing(null)
        setToDelete(null)
      },
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Simulazioni"
        description={
          showOrg
            ? "Crea i test tecnici a partire da un documento o redigendo le domande, e assegnali a un'organizzazione."
            : 'Crea i test tecnici a partire da un documento o redigendo le domande.'
        }
        actions={
          <PrimaryButton icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
            Nuova Simulazione
          </PrimaryButton>
        }
      />

      <SimulationsFilters
        value={filters}
        isSearching={Boolean(search)}
        onChange={changeFilters}
        onReset={resetFilters}
      />

      {isLoading ? (
        <TableSkeleton columns={columns} message="Caricamento simulazioni..." />
      ) : (
        <DataTable
          columns={columns}
          items={filtered}
          emptyMessage={emptyMessage(debouncedSearch, filters)}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={
            showOrg
              ? 'Cerca per titolo, organizzazione o documento...'
              : 'Cerca per titolo o documento...'
          }
          pageResetKey={`${filters.status}|${filters.kind}|${filters.source}|${debouncedSearch}`}
          renderRow={(simulation) => (
            <Tr
              key={simulation.id}
              className="cursor-pointer"
              onClick={() => setViewing(simulation)}
            >
              <Td align="left">
                <span className="block text-[0.9rem] font-medium text-slate-100">
                  {simulation.title}
                </span>
                {/* Sotto il titolo il documento, dove c'è. Che le domande
                    siano scritte a mano lo dice la targhetta nella colonna
                    del tipo, e ripeterlo qui sarebbe la stessa cosa scritta
                    due volte sulla stessa riga. */}
                {simulation.document_name && (
                  <span className="block truncate text-xs text-slate-500">
                    {simulation.document_name}
                  </span>
                )}
              </Td>
              {showOrg && (
                <Td className="text-[0.85rem] text-slate-400">{simulation.organization_name}</Td>
              )}
              <Td compact>
                <div className="flex items-center justify-center gap-1.5">
                  <SimulationKindBadge kind={simulation.kind} />
                  <SimulationSourceBadge source={simulation.source} />
                </div>
              </Td>
              <Td compact className="tabular-nums text-slate-400">
                {simulation.question_count}
              </Td>
              <Td>
                <Badge tone={statusBadgeTone(simulation.status)}>
                  {statusLabel(simulation.status)}
                </Badge>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-[0.85rem] tabular-nums text-slate-500">
                  {formatDate(simulation.created_at)}
                </span>
              </Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-2">
                  {/* La matita apre il pannello delle domande: modificare una
                      simulazione vuol dire scriverle e pubblicarle, non
                      correggere un titolo in un form. */}
                  <Tooltip content="Modifica simulazione">
                    <button
                      type="button"
                      className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                      onClick={() => setOpenId(simulation.id)}
                      aria-label={`Modifica ${simulation.title}`}
                    >
                      <PencilIcon />
                    </button>
                  </Tooltip>
                  <Tooltip content="Elimina Simulazione">
                    <button
                      type="button"
                      className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-500`}
                      onClick={() => setToDelete(simulation)}
                      aria-label={`Elimina ${simulation.title}`}
                    >
                      <TrashIcon />
                    </button>
                  </Tooltip>
                </div>
              </Td>
            </Tr>
          )}
        />
      )}

      {creating && (
        <SimulationCreateModal
          organizations={organizations}
          defaultOrganizationId={user?.organization_id ?? null}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setOpenId(id)
          }}
        />
      )}

      {/* Dettaglio simulazione (clic sulla riga) */}
      {viewing && (
        <SimulationDetailModal
          simulation={viewing}
          showOrganization={showOrg}
          onClose={() => setViewing(null)}
        />
      )}

      {/* Pannello domande e pubblicazione (matita) */}
      {openId && (
        <SimulationEditorModal
          simulationId={openId}
          showOrganization={showOrg}
          onClose={() => setOpenId(null)}
        />
      )}

      {toDelete && (
        <ConfirmModal
          icon={<TrashIcon size={24} />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10 text-red-300"
          title="Elimina Simulazione"
          description={
            <>
              La simulazione <strong>{toDelete.title}</strong> verrà eliminata con le sue domande e
              tutti i tentativi già svolti. L'operazione è definitiva. Per renderla non più
              disponibile conservando i risultati, ritirala invece di eliminarla.
            </>
          }
          error={remove.isError ? (remove.error as Error).message : undefined}
          confirmLabel="Elimina"
          pendingLabel="Eliminazione..."
          confirmClassName="bg-red-500/15 text-red-300 hover:bg-red-500/25"
          isPending={remove.isPending}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
      )}
    </PageContainer>
  )
}
