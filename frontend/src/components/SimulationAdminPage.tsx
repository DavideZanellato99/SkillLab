import { useState } from 'react'
import { useAdminSimulations, useDeleteSimulation } from '../hooks/useSimulations'
import { useOrganizations } from '../hooks/useOrganizations'
import type { Simulation } from '../services/simulations'
import { PageContainer, PageHeader } from './PageLayout'
import DataTable, { Td, Tr } from './DataTable'
import LoadingState from './LoadingState'
import PrimaryButton from './PrimaryButton'
import Badge from './Badge'
import ConfirmModal from './ConfirmModal'
import { PlusIcon, TrashIcon } from './icons'
import { matchesSearch } from './tableSearch'
import SimulationCreateModal from './SimulationCreateModal'
import SimulationDetailModal from './SimulationDetailModal'
import { formatDateTime } from './simulationFormat'

/* La gestione delle simulazioni tecniche, riservata al super admin.
 *
 * La tabella è l'indice: si crea da qui, e ogni riga si apre sul pannello in
 * cui si generano le domande, si rileggono, si correggono e si pubblica. Il
 * ciclo di vita sta tutto in quel pannello perché è una cosa sola, non
 * cinque schermate. */

const STATUS_TONES: Record<string, string> = {
  draft: 'border border-amber-500/25 bg-amber-500/10 text-amber-400',
  published: 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'Bozza',
  published: 'Pubblicata',
}

const COLUMNS = [
  { key: 'title', label: 'Simulazione' },
  { key: 'organization', label: 'Organizzazione' },
  { key: 'questions', label: 'Domande', align: 'center' as const, compact: true },
  { key: 'status', label: 'Stato' },
  { key: 'created', label: 'Creata' },
  { key: 'actions', label: '', ariaLabel: 'Azioni' },
]

const iconBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50'

export default function SimulationAdminPage() {
  const { data: simulations = [], isLoading } = useAdminSimulations()
  const { data: organizations = [] } = useOrganizations()
  const remove = useDeleteSimulation()

  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Simulation | null>(null)

  const filtered = simulations.filter((s) =>
    matchesSearch(search, s.title, s.organization_name, s.document_name),
  )

  const confirmDelete = () => {
    if (!toDelete) return
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        if (openId === toDelete.id) setOpenId(null)
        setToDelete(null)
      },
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Simulazioni"
        description="Crea i test tecnici da un documento e assegnali a un'organizzazione."
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
            search ? 'Nessuna simulazione corrisponde alla ricerca.' : 'Nessuna simulazione ancora.'
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per titolo, organizzazione o documento..."
        >
          {filtered.map((simulation) => (
            <Tr key={simulation.id}>
              <Td>
                <button
                  className="cursor-pointer border-none bg-transparent p-0 text-left text-[0.9rem] font-medium text-slate-100 transition hover:text-violet-400"
                  onClick={() => setOpenId(simulation.id)}
                >
                  {simulation.title}
                </button>
                <span className="block truncate text-xs text-slate-500">
                  {simulation.document_name}
                </span>
              </Td>
              <Td className="text-[0.85rem] text-slate-400">{simulation.organization_name}</Td>
              <Td align="center" compact className="tabular-nums text-slate-400">
                {simulation.question_count}
              </Td>
              <Td>
                <Badge tone={STATUS_TONES[simulation.status] ?? ''}>
                  {STATUS_LABELS[simulation.status] ?? simulation.status}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-xs text-slate-500">
                {formatDateTime(simulation.created_at)}
              </Td>
              <Td align="right">
                <button
                  className={iconBtnCls}
                  onClick={() => setToDelete(simulation)}
                  aria-label={`Elimina ${simulation.title}`}
                >
                  <TrashIcon size={15} />
                </button>
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

      {openId && <SimulationDetailModal simulationId={openId} onClose={() => setOpenId(null)} />}

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
