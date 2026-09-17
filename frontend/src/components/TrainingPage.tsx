import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { isSuperAdmin } from '../services/auth'
import { useOrganizations } from '../hooks/useOrganizations'
import { usePagination } from '../hooks/usePagination'
import { useDeletePath, usePaths } from '../hooks/useTraining'
import type { TrainingPath } from '../services/training'
import { errorMessage } from '../services/errors'
import AssignPathModal from './AssignPathModal'
import ConfirmModal from './ConfirmModal'
import { assignedPathUrl } from './dashboardViews'
import EmptyState from './EmptyState'
import FormError from './FormError'
import LoadError from './LoadError'
import LoadingState from './LoadingState'
import PaginationBar from './Pagination'
import PathDebriefingModal from './PathDebriefingModal'
import PrimaryButton from './PrimaryButton'
import SearchInput from './SearchInput'
import TrainingFilters from './TrainingFilters'
import TrainingPathCard from './TrainingPathCard'
import TrainingPathEditorModal from './TrainingPathEditorModal'
import { PageContainer, PageHeader } from './PageLayout'
import { matchesSearch } from './tableSearch'
import { stepTarget } from './trainingFormat'
import { PlusIcon, TrashIcon } from './icons'

/* I percorsi di training, visti da chi li governa: di cosa sono fatti, e
 * da qui si compongono e si assegnano.
 *
 * A che punto è la propria gente non sta più qui ma nella dashboard, nella
 * vista dei percorsi: è una lettura, la stessa domanda dei quattro numeri
 * che le stanno sopra fatta persona per persona, e comporre e seguire sono
 * due lavori che si fanno in due momenti diversi della settimana. Le due
 * pagine però restano legate: dal numero di chi sta percorrendo un percorso
 * si passa a quell'elenco già filtrato su di lui, che è la domanda che
 * viene subito dopo aver letto quel numero.
 *
 * Il filtro per organizzazione ha senso solo per il super admin, che è
 * l'unico a vederne più di una.
 *
 * Entrambi i ruoli di amministrazione compongono e assegnano. Un
 * organization admin è chi insegna davvero ai propri studenti, e far passare
 * ogni percorso dal super admin metterebbe in mezzo un estraneo al corso; a
 * confinarlo è il tenant, come sempre, e lo impone il server.
 *
 * Anche i percorsi si cercano e si sfogliano: un elenco che cresce di una
 * scheda a settimana diventa un muro da scorrere, e chi arriva qui di solito
 * sa già quale percorso vuole toccare. La griglia ne mette due per riga
 * perché una scheda a tutta pagina, di quel contenuto, è per metà spazio
 * vuoto. */

export default function TrainingPage() {
  const { user } = useAuth()
  const isSuper = isSuperAdmin(user)
  const navigate = useNavigate()

  const [orgFilter, setOrgFilter] = useState('')
  const [pathSearch, setPathSearch] = useState('')
  const [editing, setEditing] = useState<TrainingPath | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [assigning, setAssigning] = useState<TrainingPath | null>(null)
  /* Di quale percorso si sta leggendo il quadro d'insieme del gruppo. Il
   * percorso intero e non il solo id: la finestra ne scrive il titolo e conta
   * quante persone lo stanno percorrendo, che è quello che decide se il
   * quadro si può chiedere. */
  const [debriefing, setDebriefing] = useState<TrainingPath | null>(null)
  const [pathToDelete, setPathToDelete] = useState<TrainingPath | null>(null)

  const { data: organizations = [] } = useOrganizations(isSuper)
  const {
    data: paths = [],
    isPending: isLoadingPaths,
    error: pathsError,
    refetch: reloadPaths,
  } = usePaths(orgFilter)

  const deletePathMutation = useDeletePath()

  /* Dal numero di chi sta percorrendo un percorso all'elenco di chi sono:
   * la vista dei percorsi della dashboard già ristretta su quello, invece di
   * aprirla e ritrovare il titolo a mano fra tutte le assegnazioni. Il
   * super admin ci arriva anche con l'organizzazione del percorso, che è
   * quella in cui la tendina di là lo offre. */
  const showAssignedOf = (path: TrainingPath) => {
    navigate(assignedPathUrl(path.id, isSuper ? path.organization_id : undefined))
  }

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
  /* La chiave dice cosa rende questo un elenco diverso: cambiata la domanda,
   * si torna alla prima pagina. Restare alla terza pagina di una ricerca
   * appena riscritta vuol dire guardare le schede in mezzo a un elenco di cui
   * non si è ancora visto l'inizio. */
  const { visible: visiblePaths, bar: pathsBar } = usePagination(
    filteredPaths,
    `${orgFilter}|${pathSearch}`,
  )

  /* La fascia in cima è per il caso in cui la lettura cade mentre le sue
   * schede sono già a schermo: quelle restano buone, e va detto senza
   * portarle via. */
  const pathsErrorMessage = errorMessage(pathsError, 'Impossibile caricare i percorsi.')
  const staleError = paths.length > 0 ? pathsErrorMessage : ''

  /* Aprire una conferma azzera l'esito di quella di prima.
   *
   * L'errore vive nella mutation, che è una sola per tutta la pagina: senza
   * questo passaggio, un'eliminazione rifiutata alle nove lasciava il proprio
   * banner rosso dentro la conferma aperta alle nove e cinque su un altro
   * percorso, che di suo non aveva ancora fatto niente. */
  const askDeletePath = (path: TrainingPath | null) => {
    deletePathMutation.reset()
    setPathToDelete(path)
  }

  const handleDeletePath = async () => {
    if (!pathToDelete) return
    try {
      await deletePathMutation.mutateAsync(pathToDelete.id)
      setPathToDelete(null)
    } catch {
      // Il messaggio resta nella mutation, la conferma lo mostra
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Percorsi di Training"
        description="Sequenze di tappe da superare in ordine: la successiva si apre quando la precedente è chiusa."
        actions={
          <PrimaryButton
            icon={<PlusIcon />}
            onClick={() => setIsComposing(true)}
            className="max-sm:w-full"
          >
            Nuovo Percorso
          </PrimaryButton>
        }
      />

      {/* L'organizzazione sotto l'intestazione, come in ogni altro elenco
          dell'applicazione: accanto al titolo stava nello stesso posto
          dell'azione principale, e su schermo stretto le due finivano una
          sopra l'altra. */}
      {isSuper && (
        <TrainingFilters
          value={orgFilter}
          organizationOptions={organizations.map((o) => ({ value: o.id, label: o.name }))}
          onChange={setOrgFilter}
          onReset={() => setOrgFilter('')}
        />
      )}

      {staleError && <FormError message={staleError} variant="page" />}

      {isLoadingPaths ? (
        <LoadingState message="Caricamento percorsi..." />
      ) : pathsErrorMessage && paths.length === 0 ? (
        /* Una lettura caduta non è un elenco senza percorsi: senza questo
           riquadro si leggeva «Nessun percorso ancora composto», e per
           riprovare bisognava ricaricare la pagina. */
        <LoadError
          message={pathsErrorMessage}
          variant="page"
          onRetry={() => void reloadPaths()}
          className="py-8"
        />
      ) : paths.length === 0 ? (
        <EmptyState
          title="Nessun percorso ancora composto"
          hint="Si compone con «Nuovo Percorso», qui sopra, mettendo in fila le prove da superare"
        />
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
            <EmptyState title="Nessun percorso corrisponde alla ricerca" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                {visiblePaths.map((path) => (
                  <TrainingPathCard
                    key={path.id}
                    path={path}
                    showOrganization={isSuper}
                    onShowAssigned={() => showAssignedOf(path)}
                    onAssign={() => setAssigning(path)}
                    onDebriefing={() => setDebriefing(path)}
                    onEdit={() => setEditing(path)}
                    onDelete={() => askDeletePath(path)}
                  />
                ))}
              </div>
              {/* La barra sta sotto la griglia e non dentro una scheda: qui
                  non c'è un riquadro di cui essere il bordo basso. */}
              <PaginationBar {...pathsBar} label="Percorsi" className="mt-1" />
            </>
          )}
        </>
      )}

      {(isComposing || editing) && (
        <TrainingPathEditorModal
          path={editing}
          organizations={isSuper ? organizations : []}
          /* Il super admin che sta guardando una sola organizzazione compone
             per quella: partendo dalla prima dell'elenco, il percorso appena
             creato sarebbe nato altrove e sarebbe sparito dalla schermata da
             cui lo si è composto. Senza filtro resta il proprio tenant, che
             per il super admin è vuoto e lascia decidere alla tendina. */
          defaultOrganizationId={orgFilter || user?.organization_id || null}
          onClose={() => {
            setIsComposing(false)
            setEditing(null)
          }}
        />
      )}

      {assigning && <AssignPathModal path={assigning} onClose={() => setAssigning(null)} />}

      {debriefing && <PathDebriefingModal path={debriefing} onClose={() => setDebriefing(null)} />}

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
          error={errorMessage(deletePathMutation.error, 'Eliminazione non riuscita.')}
          confirmLabel="Elimina il percorso"
          pendingLabel="Eliminazione..."
          confirmClassName="bg-red-500/90 text-white hover:bg-red-500"
          isPending={deletePathMutation.isPending}
          onConfirm={handleDeletePath}
          onClose={() => setPathToDelete(null)}
        />
      )}
    </PageContainer>
  )
}
