/* La gestione degli avatar: i clienti simulati e le loro schede persona.
 *
 * L'eliminazione di un avatar è logica: esce dal catalogo degli studenti ma
 * conversazioni, valutazioni e scheda restano intatte. Per questo la pagina
 * mostra il catalogo per default e tiene l'archivio a portata di filtro, da
 * cui ogni avatar può tornare indietro.
 *
 * La scheda vera e propria vive in AvatarFormModal: qui restano l'elenco, i
 * filtri e le due scritture che agiscono su una riga sola. */

import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useAdminAvatars, useDeleteAvatar, useRestoreAvatar } from '../hooks/useAdminAvatars'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useFlashMessage } from '../hooks/useFlashMessage'
import { useOrganizations } from '../hooks/useOrganizations'
import type { AdminAvatar } from '../services/admin'
import { isSuperAdmin } from '../services/auth'
import { errorMessage } from '../services/errors'
import AvatarCategoriesModal from './AvatarCategoriesModal'
import AvatarDetailModal from './AvatarDetailModal'
import AvatarFormModal from './AvatarFormModal'
import AvatarRow from './AvatarRow'
import AvatarsFilters, { STATUS_ACTIVE, STATUS_ARCHIVED } from './AvatarsFilters'
import ConfirmModal from './ConfirmModal'
import DataTable from './DataTable'
import type { DataTableColumn } from './DataTable'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import LoadError from './LoadError'
import { PageContainer, PageHeader } from './PageLayout'
import TableSkeleton from './TableSkeleton'
import PrimaryButton from './PrimaryButton'
import SecondaryButton from './SecondaryButton'
import { matchesSearch } from './tableSearch'
import { PlusIcon, TrashIcon } from './icons'

/* Le percentuali sommano a 100. All'avatar tocca la fetta più larga: è
 * l'unica colonna con due righe di testo, immagine, nome e descrizione.
 *
 * Si ordina per nome, per organizzazione, per categoria e per quante
 * conversazioni ha raccolto: l'ultima è quella che risponde a "quali
 * scenari vengono usati davvero", che a occhio non si legge. Le azioni no,
 * perché non portano un dato. */
const AVATAR_COLUMNS: DataTableColumn<AdminAvatar>[] = [
  { key: 'avatar', label: 'Avatar', width: '32%', sortValue: (a) => a.name },
  {
    key: 'organizzazione',
    label: 'Organizzazione',
    width: '17%',
    sortValue: (a) => a.organization_name,
  },
  { key: 'categoria', label: 'Categoria', width: '17%', sortValue: (a) => a.category },
  {
    key: 'conversazioni',
    label: 'Conversazioni',
    width: '16%',
    sortValue: (a) => a.conversation_count,
  },
  { key: 'azioni', label: 'Azioni', width: '18%' },
]

export default function AvatarAdminPage() {
  const { user } = useAuth()
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()
  /* La casella scrive subito, il filtro aspetta la fine della parola: sotto
   * c'è il catalogo intero del tenant, e riscorrerlo a ogni tasto premuto
   * ridisegnava la tabella cinque volte per una ricerca sola. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  // Anche gli archiviati: sono una vista di questa stessa tabella.
  const {
    data: avatars = [],
    isPending: isLoading,
    error: loadError,
    refetch: reloadAvatars,
  } = useAdminAvatars(true, isSuperAdmin(user))

  /* Filtro organizzazione, tenuto anche nell'URL (?organization_id=...): il
   * dettaglio di un'organizzazione linka qui per i suoi avatar, e un
   * ricaricamento o un link condiviso riaprono la pagina già filtrata. */
  const [searchParams, setSearchParams] = useSearchParams()
  const [orgFilter, setOrgFilterValue] = useState(() => searchParams.get('organization_id') ?? '')
  const setOrgFilter = useCallback(
    (value: string) => {
      setOrgFilterValue(value)
      setSearchParams(
        (params) => {
          if (value) params.set('organization_id', value)
          else params.delete('organization_id')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ACTIVE)

  // Ogni avatar appartiene a esattamente un'organizzazione
  const organizationOptions = organizations.map((o) => ({ value: o.id, label: o.name }))

  const matchesStatus = (a: AdminAvatar) =>
    statusFilter === '' ||
    (statusFilter === STATUS_ARCHIVED ? a.deleted_at !== null : a.deleted_at === null)

  const matchesOrg = (a: AdminAvatar) => !orgFilter || a.organization_id === orgFilter

  const visibleAvatars = avatars.filter(
    (a) =>
      matchesOrg(a) &&
      matchesStatus(a) &&
      matchesSearch(debouncedSearch, a.name, a.description, a.category),
  )

  /* Quanti ne tiene l'archivio, contati dentro l'organizzazione che si sta
   * guardando: il numero sta accanto alla voce "Archiviati", e un totale di
   * tutti i tenant accanto a una tabella che ne mostra uno solo è un numero
   * che non torna con le righe che compaiono scegliendolo. */
  const archivedCount = avatars.filter((a) => a.deleted_at !== null && matchesOrg(a)).length

  /* Cosa sta restringendo la tabella, ricerca compresa: è quello che il
   * bottone azzera, ed è la condizione per cui esiste. Prima la ricerca
   * restava fuori da entrambe le cose, quindi "Azzera Filtri" spariva con
   * una tabella ancora filtrata e, quando c'era, lasciava il testo cercato
   * dov'era. */
  const hasFilters = Boolean(search) || Boolean(orgFilter) || statusFilter !== STATUS_ACTIVE

  const clearFilters = () => {
    setSearch('')
    setOrgFilter('')
    setStatusFilter(STATUS_ACTIVE)
  }

  // Cosa è aperto sopra la tabella: 'new' crea, un avatar modifica
  const [editing, setEditing] = useState<AdminAvatar | 'new' | null>(null)
  /* Dettaglio in sola lettura, aperto dal clic sulla riga come nelle tabelle
   * di utenti e organizzazioni: la matita resta l'unica strada per modificare. */
  const [viewing, setViewing] = useState<AdminAvatar | null>(null)
  const [deleting, setDeleting] = useState<AdminAvatar | null>(null)
  /* L'anagrafica delle categorie, che si apre sia dalla testata della pagina
   * sia dal campo della scheda: nel secondo caso sta sopra la scheda aperta,
   * e parte dall'organizzazione che quella scheda ha già scelto. */
  const [categoriesOrgId, setCategoriesOrgId] = useState<string | null>(null)

  const deleteMutation = useDeleteAvatar()
  const restoreMutation = useRestoreAvatar()

  const handleConfirmDelete = async () => {
    if (!deleting) return
    try {
      const result = await deleteMutation.mutateAsync(deleting.id)
      setDeleting(null)
      flashSuccess(result.message)
    } catch {
      // Il messaggio è nella mutation, la conferma resta aperta a mostrarlo
    }
  }

  const handleRestore = async (avatar: AdminAvatar) => {
    try {
      const restored = await restoreMutation.mutateAsync(avatar.id)
      flashSuccess(`Avatar ${restored.name} ripristinato: è di nuovo in catalogo.`)
    } catch {
      // idem
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Avatar"
        description="Crea, modifica ed elimina i clienti simulati e le loro schede persona."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* La variante larga, che è quella dei bottoni in testa a una
                schermata: sta accanto all'azione principale e deve avere la
                sua stessa misura. Era una riga di classi scritta qui, cioè la
                sola copia larga fra sette, e da fuori non si capiva se fosse
                una scelta o una svista. */}
            <SecondaryButton variant="action" onClick={() => setCategoriesOrgId(orgFilter)}>
              Categorie
            </SecondaryButton>
            <PrimaryButton icon={<PlusIcon />} onClick={() => setEditing('new')}>
              Nuovo Avatar
            </PrimaryButton>
          </div>
        }
      />

      <AvatarsFilters
        organizationId={orgFilter}
        status={statusFilter}
        organizationOptions={organizationOptions}
        archivedCount={archivedCount}
        isSearching={Boolean(search)}
        onOrganizationChange={setOrgFilter}
        onStatusChange={setStatusFilter}
        onReset={clearFilters}
      />

      {successMsg && <FormSuccess message={successMsg} variant="page" />}

      {/* Un catalogo che non è arrivato non è un catalogo vuoto: senza questo
          riquadro la tabella diceva che non c'è nessun avatar, e l'unica via
          d'uscita era ricaricare la pagina. Con delle righe già a schermo
          basta invece dirlo, che quelle restano buone. */}
      {loadError && avatars.length > 0 && (
        <FormError
          message={errorMessage(loadError, 'Impossibile caricare gli avatar.')}
          variant="page"
        />
      )}

      {loadError && avatars.length === 0 ? (
        <LoadError
          message={errorMessage(loadError, 'Impossibile caricare gli avatar.')}
          variant="page"
          onRetry={() => void reloadAvatars()}
          className="py-8"
        />
      ) : isLoading ? (
        <TableSkeleton columns={AVATAR_COLUMNS} message="Caricamento avatar..." />
      ) : (
        <DataTable
          columns={AVATAR_COLUMNS}
          items={visibleAvatars}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, brief o categoria..."
          /* Cambiare un filtro riporta alla prima pagina: era l'unica tabella
             dell'applicazione senza, e si restava alla terza pagina di un
             catalogo che nel frattempo era diventato un altro. */
          pageResetKey={`${orgFilter}|${statusFilter}|${debouncedSearch}`}
          emptyMessage={
            statusFilter === STATUS_ARCHIVED && !search && !orgFilter
              ? 'Nessun avatar archiviato. Gli avatar eliminati vengono raccolti qui, con tutte le loro conversazioni'
              : hasFilters
                ? 'Nessun avatar corrisponde ai filtri'
                : 'Nessun avatar presente. Crea il primo con "Nuovo Avatar"'
          }
          renderRow={(a) => (
            <AvatarRow
              key={a.id}
              avatar={a}
              isRestoring={restoreMutation.isPending && restoreMutation.variables === a.id}
              onView={setViewing}
              onEdit={setEditing}
              onDelete={(target) => {
                deleteMutation.reset()
                setDeleting(target)
              }}
              onRestore={handleRestore}
            />
          )}
        />
      )}

      {/* Dal dettaglio si passa alla modifica senza tornare a cercare la
          matita nella riga: è la domanda che viene dopo aver letto la scheda,
          e la riga da cui si era partiti nel frattempo può essere finita
          sotto un filtro o su un'altra pagina. */}
      {viewing && (
        <AvatarDetailModal
          avatar={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing)
            setViewing(null)
          }}
        />
      )}

      {editing && (
        <AvatarFormModal
          target={editing}
          organizationOptions={organizationOptions}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            // Un avatar nuovo nasce in catalogo: se la tabella sta mostrando
            // l'archivio, torna sul catalogo così l'admin lo vede comparire.
            if (editing === 'new' && statusFilter === STATUS_ARCHIVED) {
              setStatusFilter(STATUS_ACTIVE)
            }
            setEditing(null)
            flashSuccess(message)
          }}
          onManageCategories={(organizationId) => setCategoriesOrgId(organizationId || orgFilter)}
        />
      )}

      {categoriesOrgId !== null && (
        <AvatarCategoriesModal
          organizationId={categoriesOrgId || undefined}
          elevated={editing !== null}
          onClose={() => setCategoriesOrgId(null)}
        />
      )}

      {deleting && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Avatar"
          description={
            <>
              <strong className="text-slate-100">{deleting.name}</strong> viene rimosso dalla
              galleria degli studenti e non sarà più possibile avviare nuove sessioni.
              {/* L'eliminazione è logica: dirlo qui evita che sembri una
                  cancellazione di dati e che l'admin si fermi per paura. */}
              <span className="mt-3 block rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-left text-[0.8rem] text-emerald-300">
                {deleting.conversation_count > 0 ? (
                  <>
                    Le{' '}
                    <strong className="text-emerald-200">
                      {deleting.conversation_count} conversazioni
                    </strong>{' '}
                    già svolte, con le loro valutazioni, restano intatte e continuano a comparire
                    nei report.
                  </>
                ) : (
                  <>Nessun dato viene cancellato.</>
                )}{' '}
                Puoi ripristinare l'avatar in qualsiasi momento dal filtro "Archiviati".
              </span>
            </>
          }
          error={errorMessage(deleteMutation.error, "Errore durante l'archiviazione.") || undefined}
          confirmLabel="Elimina Avatar"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </PageContainer>
  )
}
