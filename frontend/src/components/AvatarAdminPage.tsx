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
import { useFlashMessage } from '../hooks/useFlashMessage'
import { useOrganizations } from '../hooks/useOrganizations'
import type { AdminAvatar } from '../services/admin'
import { isSuperAdmin } from '../services/auth'
import AvatarCategoriesModal from './AvatarCategoriesModal'
import AvatarDetailModal from './AvatarDetailModal'
import AvatarFormModal from './AvatarFormModal'
import AvatarRow from './AvatarRow'
import ConfirmModal from './ConfirmModal'
import DataTable from './DataTable'
import type { DataTableColumn } from './DataTable'
import { fieldCls, labelCls } from './Field'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import PrimaryButton from './PrimaryButton'
import Select from './Select'
import { matchesSearch } from './tableSearch'
import { PlusIcon, TrashIcon } from './icons'

const AVATAR_COLUMNS: DataTableColumn[] = [
  { key: 'avatar', label: 'Avatar' },
  { key: 'organizzazione', label: 'Organizzazione' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'difficolta', label: 'Difficoltà' },
  { key: 'conversazioni', label: 'Conversazioni', align: 'center' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
]

const STATUS_ACTIVE = 'active'
const STATUS_ARCHIVED = 'archived'

const STATUS_OPTIONS = [
  { value: STATUS_ACTIVE, label: 'In catalogo' },
  { value: STATUS_ARCHIVED, label: 'Archiviati' },
  { value: '', label: 'Tutti' },
]

const errorOf = (error: unknown, fallback: string) =>
  error ? (error instanceof Error ? error.message : fallback) : ''

export default function AvatarAdminPage() {
  const { user } = useAuth()
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()
  const [search, setSearch] = useState('')

  // Anche gli archiviati: sono una vista di questa stessa tabella.
  const {
    data: avatars = [],
    isPending: isLoading,
    error: loadError,
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

  const visibleAvatars = avatars.filter(
    (a) =>
      (!orgFilter || a.organization_id === orgFilter) &&
      matchesStatus(a) &&
      matchesSearch(search, a.name, a.description, a.category, a.difficulty),
  )

  const archivedCount = avatars.filter((a) => a.deleted_at !== null).length

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
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-6 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
              onClick={() => setCategoriesOrgId(orgFilter)}
            >
              Categorie
            </button>
            <PrimaryButton icon={<PlusIcon size={18} />} onClick={() => setEditing('new')}>
              Nuovo Avatar
            </PrimaryButton>
          </div>
        }
      />

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="avatars-org-filter">
            Organizzazione
          </label>
          <Select
            id="avatars-org-filter"
            className="min-w-[220px]"
            value={orgFilter}
            onChange={setOrgFilter}
            options={[{ value: '', label: 'Tutte le organizzazioni' }, ...organizationOptions]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="avatars-status-filter">
            Stato
          </label>
          <Select
            id="avatars-status-filter"
            className="min-w-[160px]"
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS.map((o) =>
              o.value === STATUS_ARCHIVED && archivedCount
                ? { ...o, label: `${o.label} (${archivedCount})` }
                : o,
            )}
          />
        </div>
        {(orgFilter || statusFilter !== STATUS_ACTIVE) && (
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            onClick={() => {
              setOrgFilter('')
              setStatusFilter(STATUS_ACTIVE)
            }}
          >
            Azzera filtri
          </button>
        )}
      </div>

      {successMsg && <FormSuccess message={successMsg} variant="page" />}
      {loadError && <FormError message={errorOf(loadError, 'Impossibile caricare gli avatar.')} />}

      {isLoading ? (
        <LoadingState message="Caricamento avatar..." />
      ) : (
        <DataTable
          columns={AVATAR_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, categoria o difficoltà..."
          isEmpty={visibleAvatars.length === 0}
          emptyMessage={
            statusFilter === STATUS_ARCHIVED && !search && !orgFilter
              ? 'Nessun avatar archiviato. Gli avatar eliminati vengono raccolti qui, con tutte le loro conversazioni'
              : search || orgFilter || statusFilter !== STATUS_ACTIVE
                ? 'Nessun avatar corrisponde ai filtri'
                : 'Nessun avatar presente. Crea il primo con "Nuovo Avatar"'
          }
        >
          {visibleAvatars.map((a) => (
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
          ))}
        </DataTable>
      )}

      {viewing && <AvatarDetailModal avatar={viewing} onClose={() => setViewing(null)} />}

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
          error={errorOf(deleteMutation.error, "Errore durante l'archiviazione.") || undefined}
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
