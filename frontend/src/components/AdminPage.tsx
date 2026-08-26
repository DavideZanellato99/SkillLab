/* La gestione utenti: chi può entrare nell'applicazione e con quale ruolo.
 *
 * Questa pagina tiene insieme i pezzi e non disegna nulla di suo: i filtri,
 * la riga della tabella e le tre modali stanno ognuno nel proprio file. Qui
 * restano l'elenco, le scritture che agiscono su una riga sola (eliminazione,
 * rinvio credenziali, cambio di stato) e le conferme che le precedono. */

import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import {
  useAdminUsers,
  useDeleteUser,
  useResendUserCredentials,
  useSetUserStatus,
  USERS_WINDOW_SIZE,
} from '../hooks/useAdminUsers'
import { useAuth } from '../hooks/useAuth'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useFlashMessage } from '../hooks/useFlashMessage'
import { useOrganizations } from '../hooks/useOrganizations'
import type { AdminUser } from '../services/admin'
import type { RoleName, UserStatus } from '../services/auth'
import { isSuperAdmin } from '../services/auth'
import { errorMessage } from '../services/errors'
import { STATUS_ACTIONS, USER_COLUMNS } from './adminUsersConfig'
import ConfirmModal from './ConfirmModal'
import DataTable from './DataTable'
import FormError from './FormError'
import FormSuccess from './FormSuccess'
import LoadingState from './LoadingState'
import LoadMoreButton from './LoadMoreButton'
import { PageContainer, PageHeader } from './PageLayout'
import PrimaryButton from './PrimaryButton'
import UserCreateModal from './UserCreateModal'
import UserDetailModal from './UserDetailModal'
import UserEditModal from './UserEditModal'
import UserRow from './UserRow'
import UsersFilters from './UsersFilters'
import type { UsersFiltersValue } from './UsersFilters'
import { ResendIcon, TrashIcon, UserPlusIcon } from './icons'

const NO_FILTERS: UsersFiltersValue = { organizationId: '', ruolo: '', status: '', access: '' }

export default function AdminPage() {
  const { user } = useAuth()
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const { message: successMsg, flash: flashSuccess } = useFlashMessage()

  /* Il filtro organizzazione vive anche nell'URL (?organization_id=...): è
   * così che il dettaglio di un'organizzazione può linkare "i suoi utenti",
   * e un ricaricamento o un link condiviso riaprono la pagina già filtrata. */
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<UsersFiltersValue>(() => ({
    ...NO_FILTERS,
    organizationId: searchParams.get('organization_id') ?? '',
  }))

  const changeFilters = useCallback(
    (patch: Partial<UsersFiltersValue>) => {
      setFilters((prev) => ({ ...prev, ...patch }))
      if (patch.organizationId === undefined) return
      setSearchParams(
        (params) => {
          if (patch.organizationId) params.set('organization_id', patch.organizationId)
          else params.delete('organization_id')
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /* La ricerca sta nella tabella, ma il server la applica a tutto l'elenco:
   * aspetta che si smetta di scrivere per non chiedere una pagina per tasto. */
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  /* Azzerare comprende la ricerca: è un filtro anche lei, e lasciarla scritta
   * voleva dire premere «Azzera Filtri» e continuare a vedere un elenco
   * filtrato. */
  const resetFilters = useCallback(() => {
    setSearch('')
    changeFilters(NO_FILTERS)
  }, [changeFilters])

  const hasFilters = Boolean(
    search || filters.organizationId || filters.ruolo || filters.status || filters.access,
  )

  const organizationOptions = useMemo(
    () => organizations.map((o) => ({ value: o.id, label: o.name })),
    [organizations],
  )

  /* La finestra di utenti: i filtri stanno nella chiave, quindi cambiarne uno
   * riparte da capo, mentre "carica altri" aggiunge una pagina a quelle già
   * lette. Dopo una scrittura le mutation invalidano, e TanStack rilegge
   * tutte le pagine caricate: la finestra resta dov'era. */
  const {
    users,
    total,
    isPending: isLoading,
    isPlaceholderData: isStale,
    error: loadError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: isLoadingMore,
  } = useAdminUsers(
    {
      organizationId: filters.organizationId,
      ruolo: (filters.ruolo || undefined) as RoleName | undefined,
      status: (filters.status || undefined) as UserStatus | undefined,
      neverLoggedIn: filters.access === '' ? undefined : filters.access === 'never',
      search: debouncedSearch,
    },
    isSuperAdmin(user),
  )

  const deleteMutation = useDeleteUser()
  const resendMutation = useResendUserCredentials()
  const statusMutation = useSetUserStatus()

  // Cosa è aperto sopra la tabella: al più una cosa per volta
  const [isCreating, setIsCreating] = useState(false)
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null)
  const [resendingUser, setResendingUser] = useState<AdminUser | null>(null)
  /* `target` è lo stato verso cui si sta passando, ed è la chiave da cui la
   * modale prende titolo, testo e colore della conferma. */
  const [statusAction, setStatusAction] = useState<{ user: AdminUser; target: UserStatus } | null>(
    null,
  )

  const handleConfirmDelete = async () => {
    if (!deletingUser) return
    try {
      const result = await deleteMutation.mutateAsync(deletingUser.id)
      setDeletingUser(null)
      flashSuccess(result.message)
    } catch {
      // Il messaggio è nella mutation, la conferma resta aperta a mostrarlo
    }
  }

  const handleConfirmResend = async () => {
    if (!resendingUser) return
    try {
      const result = await resendMutation.mutateAsync(resendingUser.id)
      setResendingUser(null)
      flashSuccess(result.message)
    } catch {
      // idem
    }
  }

  const handleConfirmStatus = async () => {
    if (!statusAction) return
    try {
      const updated = await statusMutation.mutateAsync({
        userId: statusAction.user.id,
        status: statusAction.target,
      })
      setStatusAction(null)
      flashSuccess(`Utente ${updated.email} ${STATUS_ACTIONS[statusAction.target].successVerb}.`)
    } catch {
      // idem
    }
  }

  const statusCfg = statusAction ? STATUS_ACTIONS[statusAction.target] : null

  return (
    <PageContainer>
      <PageHeader
        title="Gestione Utenti"
        description="Crea, modifica ed elimina gli account autorizzati ad accedere all'applicazione."
        actions={
          <PrimaryButton icon={<UserPlusIcon size={18} />} onClick={() => setIsCreating(true)}>
            Nuovo Utente
          </PrimaryButton>
        }
      />

      <UsersFilters
        value={filters}
        organizationOptions={organizationOptions}
        isSearching={Boolean(search)}
        onChange={changeFilters}
        onReset={resetFilters}
      />

      {successMsg && <FormSuccess message={successMsg} variant="page" />}
      {loadError && (
        <FormError
          message={errorMessage(loadError, 'Impossibile caricare gli utenti.')}
          variant="page"
        />
      )}

      {isLoading ? (
        <LoadingState message="Caricamento utenti del sistema..." />
      ) : (
        /* Mentre arriva la risposta a un filtro nuovo restano a video le righe
           di prima, attenuate: sono ancora quelle vecchie, e `aria-busy` lo
           dice a chi la pagina non la guarda. Sostituirle con il riquadro di
           caricamento faceva sparire la tabella e saltare la pagina a ogni
           tasto premuto nella ricerca. */
        <div aria-busy={isStale} className={`transition-opacity ${isStale ? 'opacity-60' : ''}`}>
          <DataTable
            columns={USER_COLUMNS}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per nome, email o organizzazione..."
            /* Cambiare un filtro riporta alla prima pagina: le righe di prima
               restano a video mentre la risposta arriva, e senza questo si
               resterebbe alla terza pagina di un elenco che nel frattempo è
               diventato un altro. */
            pageResetKey={`${filters.organizationId}|${filters.ruolo}|${filters.status}|${filters.access}|${debouncedSearch}`}
            isEmpty={users.length === 0}
            emptyMessage={
              hasFilters ? 'Nessun utente corrisponde ai filtri.' : 'Nessun utente trovato.'
            }
            footerNote={
              hasNextPage && (
                <>
                  <span className="tabular-nums">
                    Caricati {users.length} utenti {hasFilters ? 'dei' : 'di'} {total}
                    {hasFilters ? ' che corrispondono ai filtri' : ''}
                  </span>
                  <LoadMoreButton onClick={() => fetchNextPage()} isLoading={isLoadingMore}>
                    {`Carica altri ${Math.min(USERS_WINDOW_SIZE, total - users.length)}`}
                  </LoadMoreButton>
                </>
              )
            }
          >
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === user?.id}
                onView={setViewingUser}
                onEdit={setEditingUser}
                onDelete={(target) => {
                  deleteMutation.reset()
                  setDeletingUser(target)
                }}
                onResend={(target) => {
                  resendMutation.reset()
                  setResendingUser(target)
                }}
                onChangeStatus={(target, status) => {
                  statusMutation.reset()
                  setStatusAction({ user: target, target: status })
                }}
              />
            ))}
          </DataTable>
        </div>
      )}

      {viewingUser && (
        <UserDetailModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onEdit={() => {
            setEditingUser(viewingUser)
            setViewingUser(null)
          }}
        />
      )}

      {isCreating && (
        <UserCreateModal
          organizationOptions={organizationOptions}
          onClose={() => setIsCreating(false)}
          onCreated={(created) => {
            setIsCreating(false)
            flashSuccess(
              `Utente ${created.email} creato con successo. Una email con la password temporanea è stata inviata all'indirizzo indicato.`,
            )
          }}
        />
      )}

      {editingUser && (
        <UserEditModal
          user={editingUser}
          isSelf={editingUser.id === user?.id}
          organizationOptions={organizationOptions}
          onClose={() => setEditingUser(null)}
          onUpdated={(updated) => {
            setEditingUser(null)
            flashSuccess(`Utente ${updated.email} aggiornato con successo.`)
          }}
        />
      )}

      {statusAction && statusCfg && (
        <ConfirmModal
          icon={statusCfg.icon}
          iconWrapperCls={statusCfg.iconWrapperCls}
          title={statusCfg.title}
          description={statusCfg.description(statusAction.user.email)}
          error={
            errorMessage(statusMutation.error, "Errore durante il cambio di stato dell'account.") ||
            undefined
          }
          confirmLabel={statusCfg.confirmLabel}
          pendingLabel={statusCfg.pendingLabel}
          confirmClassName={statusCfg.confirmCls}
          isPending={statusMutation.isPending}
          onConfirm={handleConfirmStatus}
          onClose={() => setStatusAction(null)}
        />
      )}

      {resendingUser && (
        <ConfirmModal
          icon={<ResendIcon size={24} stroke="#06b6d4" />}
          iconWrapperCls="border border-cyan-500/25 bg-cyan-500/10"
          title="Rinvia Credenziali"
          description={
            <>
              Verrà inviata a <strong className="text-slate-100">{resendingUser.email}</strong> una
              nuova password temporanea via email. Le credenziali attuali cesseranno immediatamente
              di funzionare e al prossimo accesso l'utente dovrà impostare una nuova password.
            </>
          }
          error={
            errorMessage(resendMutation.error, 'Errore durante il rinvio delle credenziali.') ||
            undefined
          }
          confirmLabel="Invia Nuova Password"
          pendingLabel="Invio in corso..."
          confirmClassName="border-none bg-gradient-to-br from-violet-600 to-cyan-500 text-white hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0"
          isPending={resendMutation.isPending}
          onConfirm={handleConfirmResend}
          onClose={() => setResendingUser(null)}
        />
      )}

      {deletingUser && (
        <ConfirmModal
          icon={<TrashIcon size={24} stroke="#ef4444" />}
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Utente"
          description={
            <>
              Stai per eliminare <strong className="text-slate-100">{deletingUser.email}</strong> da
              Cognito e dal database, incluse le sue conversazioni. L'operazione non è reversibile.
            </>
          }
          error={
            errorMessage(deleteMutation.error, "Errore durante l'eliminazione dell'utente.") ||
            undefined
          }
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={deleteMutation.isPending}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </PageContainer>
  )
}
