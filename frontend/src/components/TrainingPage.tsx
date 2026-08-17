import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { isSuperAdmin } from '../services/auth'
import { useOrganizations } from '../hooks/useOrganizations'
import { usePagination } from '../hooks/usePagination'
import { useAssignments, useDeleteAssignment, useDeletePath, usePaths } from '../hooks/useTraining'
import type { PathAssignment, TrainingPath } from '../services/training'
import AssignPathModal from './AssignPathModal'
import ConfirmModal from './ConfirmModal'
import FormError from './FormError'
import LoadingState from './LoadingState'
import PaginationBar from './Pagination'
import PrimaryButton from './PrimaryButton'
import SearchInput from './SearchInput'
import Select from './Select'
import TabBar from './TabBar'
import TrainingAssignmentsTable from './TrainingAssignmentsTable'
import TrainingPathCard from './TrainingPathCard'
import TrainingPathEditorModal from './TrainingPathEditorModal'
import { PageContainer, PageHeader } from './PageLayout'
import { matchesSearch } from './tableSearch'
import { stepTarget } from './trainingFormat'
import { PlusIcon, TrashIcon } from './icons'

/* I percorsi di training, visti da chi li governa.
 *
 * Due linguette perché sono due domande diverse: «di cosa sono fatti i miei
 * percorsi» e «a che punto è la mia gente». Prima era una schermata sola,
 * dove il form di assegnazione stava sopra la tabella dei risultati e ogni
 * assegnazione ricominciava dalla scelta dell'avatar; comporre e seguire
 * sono due lavori, e si fanno in due momenti diversi della settimana.
 *
 * Il filtro per organizzazione ha senso solo per il super admin, che è
 * l'unico a vederne più di una, e vale per entrambe le linguette: è di chi
 * si sta parlando, non un modo di guardare una delle due.
 *
 * Entrambi i ruoli di amministrazione compongono e assegnano. Un
 * organization admin è chi insegna davvero ai propri studenti, e far passare
 * ogni percorso dal super admin metterebbe in mezzo un estraneo al corso; a
 * confinarlo è il tenant, come sempre, e lo impone il server.
 *
 * Anche i percorsi si cercano e si sfogliano, come le assegnazioni accanto:
 * un elenco che cresce di una scheda a settimana diventa un muro da scorrere,
 * e chi arriva qui di solito sa già quale percorso vuole toccare. La griglia
 * ne mette due per riga perché una scheda a tutta pagina, di quel contenuto,
 * è per metà spazio vuoto. */

type Tab = 'paths' | 'assignments'

const emptyStateCls =
  'rounded-2xl border border-white/6 bg-gray-900/60 p-16 text-center text-slate-500 backdrop-blur-md'

export default function TrainingPage() {
  const { user } = useAuth()
  const isSuper = isSuperAdmin(user)

  const [tab, setTab] = useState<Tab>('paths')
  const [orgFilter, setOrgFilter] = useState('')
  const [pathSearch, setPathSearch] = useState('')
  const [editing, setEditing] = useState<TrainingPath | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [assigning, setAssigning] = useState<TrainingPath | null>(null)
  const [pathToDelete, setPathToDelete] = useState<TrainingPath | null>(null)
  const [toWithdraw, setToWithdraw] = useState<PathAssignment | null>(null)

  const { data: organizations = [] } = useOrganizations(isSuper)
  const { data: paths = [], isPending: isLoadingPaths, error: pathsError } = usePaths(orgFilter)
  const {
    data: assignments = [],
    isPending: isLoadingAssignments,
    error: assignmentsError,
  } = useAssignments(orgFilter)

  const deletePathMutation = useDeletePath()
  const withdrawMutation = useDeleteAssignment()

  /* Si cerca con quello che la scheda mostra, nomi delle tappe compresi: chi
   * cerca un avatar sta cercando i percorsi che lo attraversano. */
  const filteredPaths = useMemo(
    () =>
      paths.filter((path) =>
        matchesSearch(
          pathSearch,
          path.title,
          path.description,
          isSuper ? path.organization_name : '',
          ...path.steps.map(stepTarget),
        ),
      ),
    [paths, pathSearch, isSuper],
  )
  const { visible: visiblePaths, bar: pathsBar } = usePagination(filteredPaths)

  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''
  const loadError =
    errorOf(pathsError, 'Impossibile caricare i percorsi.') ||
    errorOf(assignmentsError, 'Impossibile caricare le assegnazioni.')

  const handleDeletePath = async () => {
    if (!pathToDelete) return
    try {
      await deletePathMutation.mutateAsync(pathToDelete.id)
      setPathToDelete(null)
    } catch {
      // Il messaggio resta nella mutation, la conferma lo mostra
    }
  }

  const handleWithdraw = async () => {
    if (!toWithdraw) return
    try {
      await withdrawMutation.mutateAsync(toWithdraw.id)
      setToWithdraw(null)
    } catch {
      // Come sopra
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Percorsi di Training"
        description="Sequenze di tappe da superare in ordine: la successiva si apre quando la precedente è chiusa."
        actions={
          <div className="flex flex-wrap items-center gap-3 max-sm:w-full">
            {isSuper && (
              <Select
                id="training-org-filter"
                className="min-w-[220px] shrink-0 max-sm:w-full"
                value={orgFilter}
                onChange={setOrgFilter}
                options={[
                  { value: '', label: 'Tutte le Organizzazioni' },
                  ...organizations.map((o) => ({ value: o.id, label: o.name })),
                ]}
              />
            )}
            <PrimaryButton
              icon={<PlusIcon size={16} />}
              onClick={() => setIsComposing(true)}
              className="max-sm:w-full"
            >
              Nuovo Percorso
            </PrimaryButton>
          </div>
        }
      />

      {loadError && <FormError message={loadError} />}

      <TabBar
        ariaLabel="Cosa guardare dei percorsi"
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'paths', label: `Percorsi (${paths.length})` },
          { value: 'assignments', label: `Assegnati (${assignments.length})` },
        ]}
      />

      {tab === 'paths' ? (
        isLoadingPaths ? (
          <LoadingState message="Caricamento percorsi..." />
        ) : paths.length === 0 ? (
          <p className={emptyStateCls}>Nessun percorso ancora composto</p>
        ) : (
          <>
            <SearchInput
              value={pathSearch}
              onChange={setPathSearch}
              placeholder={
                isSuper
                  ? 'Cerca per titolo, tappa o organizzazione...'
                  : 'Cerca per titolo o tappa...'
              }
              ariaLabel="Cerca fra i percorsi"
              className="mb-4 max-w-[340px]"
            />
            {filteredPaths.length === 0 ? (
              <p className={emptyStateCls}>Nessun percorso corrisponde alla ricerca</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                  {visiblePaths.map((path) => (
                    <TrainingPathCard
                      key={path.id}
                      path={path}
                      showOrganization={isSuper}
                      onAssign={() => setAssigning(path)}
                      onEdit={() => setEditing(path)}
                      onDelete={() => setPathToDelete(path)}
                    />
                  ))}
                </div>
                {/* La barra sta sotto la griglia e non dentro una scheda:
                    qui non c'è un riquadro di cui essere il bordo basso. */}
                <PaginationBar {...pathsBar} label="Percorsi" className="mt-1" />
              </>
            )}
          </>
        )
      ) : isLoadingAssignments ? (
        <LoadingState message="Caricamento assegnazioni..." />
      ) : (
        <TrainingAssignmentsTable
          assignments={assignments}
          showOrganization={isSuper}
          onWithdraw={setToWithdraw}
        />
      )}

      {(isComposing || editing) && (
        <TrainingPathEditorModal
          path={editing}
          organizations={isSuper ? organizations : []}
          defaultOrganizationId={user?.organization_id ?? null}
          onClose={() => {
            setIsComposing(false)
            setEditing(null)
          }}
        />
      )}

      {assigning && <AssignPathModal path={assigning} onClose={() => setAssigning(null)} />}

      {pathToDelete && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#f87171" />}
          iconWrapperCls="border border-red-500/30 bg-red-500/10"
          title="Eliminare il percorso?"
          description={
            <>
              «{pathToDelete.title}» sparisce{' '}
              {pathToDelete.assigned_count > 0
                ? `anche dalla home delle ${pathToDelete.assigned_count} persone che lo stanno percorrendo. `
                : ''}
              Le conversazioni e i test già svolti restano dove sono.
            </>
          }
          error={errorOf(deletePathMutation.error, 'Eliminazione non riuscita.')}
          confirmLabel="Elimina il percorso"
          pendingLabel="Eliminazione..."
          confirmClassName="bg-red-500/90 text-white hover:bg-red-500"
          isPending={deletePathMutation.isPending}
          onConfirm={handleDeletePath}
          onClose={() => setPathToDelete(null)}
        />
      )}

      {toWithdraw && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#f87171" />}
          iconWrapperCls="border border-red-500/30 bg-red-500/10"
          title="Ritirare il percorso?"
          description={
            <>
              «{toWithdraw.path_title}» sparisce dalla home di {toWithdraw.user_name}. Le
              conversazioni e i test già svolti restano dove sono.
            </>
          }
          error={errorOf(withdrawMutation.error, 'Operazione non riuscita.')}
          confirmLabel="Ritira il percorso"
          pendingLabel="Ritiro..."
          confirmClassName="bg-red-500/90 text-white hover:bg-red-500"
          isPending={withdrawMutation.isPending}
          onConfirm={handleWithdraw}
          onClose={() => setToWithdraw(null)}
        />
      )}
    </PageContainer>
  )
}
