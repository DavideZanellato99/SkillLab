import { useState } from 'react'
import { useAdminSimulations, useDeleteSimulation } from '../hooks/useSimulations'
import { useOrganizations } from '../hooks/useOrganizations'
import type { AdminSimulation } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import DataTable, { Td, Tr } from './DataTable'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Badge from './Badge'
import ConfirmModal from './ConfirmModal'
import Tooltip from './Tooltip'
import { PencilIcon, PlusIcon, TrashIcon } from './icons'
import { matchesSearch } from './tableSearch'
import SimulationCreateModal from './SimulationCreateModal'
import SimulationDetailModal from './SimulationDetailModal'
import SimulationEditorModal from './SimulationEditorModal'
import SimulationKindBadge from './SimulationKindBadge'
import SimulationSourceBadge from './SimulationSourceBadge'
import { formatDate } from './lastAccess'
import { kindLabel, sourceLabel, statusBadgeTone, statusLabel } from './simulationFormat'

/* La gestione delle simulazioni tecniche, riservata al super admin.
 *
 * La tabella si legge come quelle di utenti, organizzazioni e avatar: il clic
 * sulla riga apre la scheda di sola lettura, la matita apre il pannello in cui
 * si generano le domande, si rileggono, si correggono e si pubblica. Il ciclo
 * di vita sta tutto in quel pannello perché è una cosa sola, non cinque
 * schermate. */

const COLUMNS = [
  { key: 'title', label: 'Simulazione' },
  { key: 'organization', label: 'Organizzazione' },
  { key: 'kind', label: 'Tipo' },
  { key: 'questions', label: 'Domande', align: 'center' as const, compact: true },
  { key: 'status', label: 'Stato' },
  { key: 'creazione', label: 'Data Creazione' },
  { key: 'actions', label: 'Azioni', align: 'right' as const },
]

const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'

export default function SimulationAdminPage() {
  const { data: simulations = [], isLoading } = useAdminSimulations()
  const { data: organizations = [] } = useOrganizations()
  const remove = useDeleteSimulation()

  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  /* Il pannello di revisione, aperto dalla matita. Tiene l'id e non la riga
   * perché si ricarica dal server: le domande non stanno nell'elenco. */
  const [openId, setOpenId] = useState<string | null>(null)
  /* Dettaglio in sola lettura, aperto dal clic sulla riga come nelle tabelle
   * di utenti, organizzazioni e avatar. */
  const [viewing, setViewing] = useState<AdminSimulation | null>(null)
  const [toDelete, setToDelete] = useState<AdminSimulation | null>(null)

  const filtered = simulations.filter((s) =>
    // Il tipo e l'origine si cercano con le stesse parole che i badge mostrano
    matchesSearch(
      search,
      s.title,
      s.organization_name,
      s.document_name,
      kindLabel(s.kind),
      sourceLabel(s.source),
    ),
  )

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
        description="Crea i test tecnici da un documento o scrivendo le domande, e assegnali a un'organizzazione."
        actions={
          <PrimaryButton icon={<PlusIcon size={16} />} onClick={() => setCreating(true)}>
            Nuova Simulazione
          </PrimaryButton>
        }
      />

      {isLoading ? (
        <LoadingState message="Caricamento simulazioni..." />
      ) : (
        <DataTable
          columns={COLUMNS}
          isEmpty={filtered.length === 0}
          emptyMessage={
            search ? 'Nessuna simulazione corrisponde alla ricerca' : 'Nessuna simulazione ancora'
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per titolo, organizzazione o documento..."
        >
          {filtered.map((simulation) => (
            <Tr
              key={simulation.id}
              className="cursor-pointer"
              onClick={() => setViewing(simulation)}
            >
              <Td>
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
              <Td className="text-[0.85rem] text-slate-400">{simulation.organization_name}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SimulationKindBadge kind={simulation.kind} />
                  <SimulationSourceBadge source={simulation.source} />
                </div>
              </Td>
              <Td align="center" compact className="tabular-nums text-slate-400">
                {simulation.question_count}
              </Td>
              <Td>
                <Badge tone={statusBadgeTone(simulation.status)}>
                  {statusLabel(simulation.status)}
                </Badge>
              </Td>
              <Td>
                <span className="text-[0.85rem] text-slate-500">
                  {formatDate(simulation.created_at)}
                </span>
              </Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-2">
                  {/* La matita apre il pannello delle domande: modificare una
                      simulazione vuol dire scriverle e pubblicarle, non
                      correggere un titolo in un form. */}
                  <Tooltip content="Modifica simulazione">
                    <button
                      className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                      onClick={() => setOpenId(simulation.id)}
                      aria-label={`Modifica ${simulation.title}`}
                    >
                      <PencilIcon />
                    </button>
                  </Tooltip>
                  <Tooltip content="Elimina simulazione">
                    <button
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
          ))}
        </DataTable>
      )}

      {creating && (
        <SimulationCreateModal
          organizations={organizations}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setOpenId(id)
          }}
        />
      )}

      {/* Dettaglio simulazione (clic sulla riga) */}
      {viewing && <SimulationDetailModal simulation={viewing} onClose={() => setViewing(null)} />}

      {/* Pannello domande e pubblicazione (matita) */}
      {openId && <SimulationEditorModal simulationId={openId} onClose={() => setOpenId(null)} />}

      {toDelete && (
        <ConfirmModal
          icon={<TrashIcon size={24} />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10 text-red-300"
          title="Elimina simulazione"
          description={
            <>
              La simulazione <strong>{toDelete.title}</strong> verrà eliminata con le sue domande e
              tutti i tentativi già svolti. L'operazione è definitiva. Per toglierla di mezzo
              lasciando i risultati al loro posto, ritirala invece di eliminarla.
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
