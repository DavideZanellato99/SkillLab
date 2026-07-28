import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchUsers,
  createNewUser,
  updateUser,
  deleteUser,
  resendUserCredentials,
  setUserStatus,
} from '../services/admin'
import type { UserFilters } from '../services/admin'
import { fetchOrganizations } from '../services/organizations'
import type { Organization } from '../services/organizations'
import { isSuperAdmin, ROLE_LABELS, ROLE_BADGE_CLASSES, getInitials } from '../services/auth'
import type { AuthUser, RoleName, UserStatus } from '../services/auth'
import Select from './Select'
import DataTable, { Td, Tr } from './DataTable'
import DetailModal, { DetailField } from './DetailModal'
import Tooltip from './Tooltip'
import KebabMenu from './KebabMenu'
import Spinner from './Spinner'
import FormError from './FormError'
import ConfirmModal from './ConfirmModal'
import { formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './lastAccess'
import type { KebabMenuItem } from './KebabMenu'
import {
  ROLE_OPTIONS,
  STATUS_LABELS,
  STATUS_BADGE_CLASSES,
  NEVER_ACCESSED_BADGE_CLASSES,
  USER_COLUMNS,
  STATUS_ACTIONS,
  suspendIcon,
  reactivateIcon,
  disableIcon,
  resendIcon,
} from './adminUsersConfig'

/** Righe caricate per volta: l'elenco cresce con ogni organizzazione, quindi
 * la pagina ne tiene una finestra e la estende su richiesta. */
const WINDOW_SIZE = 200
/** Tetto imposto dall'endpoint, che la rilettura dopo una modifica non deve
 * superare quando la finestra è già stata estesa parecchie volte. */
const MAX_WINDOW = 1000

const ACCESS_OPTIONS = [
  { value: '', label: 'Qualsiasi accesso' },
  { value: 'never', label: 'Mai acceduto' },
  { value: 'done', label: 'Ha già acceduto' },
]

/* Shared form styles (modals, same look as the auth modal) */
const fieldCls = 'flex flex-col gap-1.5'
const labelCls = 'text-xs font-medium tracking-wide text-slate-400'
const inputWrapperCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]'
const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50'
const submitBtnCls =
  'mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60'
const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]'
const modalCls =
  'relative m-auto max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto overflow-x-hidden rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8'
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100'
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [total, setTotal] = useState(0)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Filtri e ricerca: girano tutti sul server, quindi coprono l'intero
  // elenco e non solo la finestra già caricata.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')
  const hasFilters = Boolean(search || orgFilter || roleFilter || statusFilter || accessFilter)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  // Options for the organization pickers (a user/org admin must have one)
  const orgOptions = organizations.map((o) => ({ value: o.id, label: o.name }))

  // Create form states
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [ruolo, setRuolo] = useState<RoleName>('user')
  const [orgId, setOrgId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Detail view (clic sulla riga): utente in sola lettura
  const [viewingUser, setViewingUser] = useState<AuthUser | null>(null)

  // Edit form states
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCognome, setEditCognome] = useState('')
  const [editRuolo, setEditRuolo] = useState<RoleName>('user')
  const [editOrgId, setEditOrgId] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete confirmation states
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Resend-credentials confirmation states
  const [resendingUser, setResendingUser] = useState<AuthUser | null>(null)
  const [isResending, setIsResending] = useState(false)
  const [resendError, setResendError] = useState('')

  // Account-status confirmation states (`target` = the status being applied)
  const [statusAction, setStatusAction] = useState<{ user: AuthUser; target: UserStatus } | null>(
    null,
  )
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  const filters = useCallback(
    (offset: number, limit: number = WINDOW_SIZE): UserFilters => ({
      organizationId: orgFilter,
      ruolo: (roleFilter || undefined) as RoleName | undefined,
      status: (statusFilter || undefined) as UserStatus | undefined,
      neverLoggedIn: accessFilter === '' ? undefined : accessFilter === 'never',
      search: debouncedSearch,
      limit,
      offset,
    }),
    [orgFilter, roleFilter, statusFilter, accessFilter, debouncedSearch],
  )

  // Prima finestra: rifatta da capo a ogni cambio di filtro o di ricerca.
  useEffect(() => {
    if (!isSuperAdmin(user)) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    fetchUsers(filters(0))
      .then((page) => {
        if (cancelled) return
        setUsers(page.items)
        setTotal(page.total)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Impossibile caricare gli utenti.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, filters])

  useEffect(() => {
    if (!isSuperAdmin(user)) return
    fetchOrganizations()
      .then(setOrganizations)
      .catch(() => setOrganizations([]))
  }, [user])

  const handleLoadMore = async () => {
    setIsLoadingMore(true)
    try {
      const page = await fetchUsers(filters(users.length))
      setUsers((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare altri utenti.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  /* Dopo una modifica la finestra si rilegge invece di essere ritoccata a
   * mano: una riga aggiornata può non soddisfare più i filtri attivi (si
   * sospende un utente mentre si filtra per «attivi») e una appena creata
   * potrebbe non rientrarci affatto. Rilegge esattamente quanto era già
   * caricato, così non si perde il punto in cui si era arrivati. */
  const reloadWindow = useCallback(async () => {
    const size = Math.min(MAX_WINDOW, Math.max(WINDOW_SIZE, users.length))
    const page = await fetchUsers(filters(0, size))
    setUsers(page.items)
    setTotal(page.total)
  }, [filters, users.length])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    // A user/organization_admin must belong to an organization
    if (ruolo !== 'super_admin' && !orgId) {
      setFormError("Seleziona l'organizzazione dell'utente.")
      return
    }
    setIsSubmitting(true)

    try {
      const created = await createNewUser({
        email,
        nome,
        cognome,
        ruolo,
        organization_id: ruolo === 'super_admin' ? null : orgId,
      })
      await reloadWindow()
      setShowModal(false)
      setEmail('')
      setNome('')
      setCognome('')
      setRuolo('user')
      setOrgId('')
      flashSuccess(
        `Utente ${created.email} creato con successo! Un'email con la password temporanea è stata inviata via Cognito.`,
      )
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore durante la creazione dell'utente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditModal = (u: AuthUser) => {
    setEditingUser(u)
    setEditNome(u.nome)
    setEditCognome(u.cognome)
    setEditRuolo(u.ruolo as RoleName)
    setEditOrgId(u.organization_id ?? '')
    setEditError('')
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditError('')

    if (editRuolo !== 'super_admin' && !editOrgId) {
      setEditError("Seleziona l'organizzazione dell'utente.")
      return
    }
    setIsSavingEdit(true)

    try {
      const updated = await updateUser(editingUser.id, {
        nome: editNome,
        cognome: editCognome,
        ruolo: editRuolo,
        organization_id: editRuolo === 'super_admin' ? null : editOrgId,
      })
      await reloadWindow()
      setEditingUser(null)
      flashSuccess(`Utente ${updated.email} aggiornato con successo.`)
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Errore durante l'aggiornamento dell'utente.",
      )
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingUser) return
    setDeleteError('')
    setIsDeleting(true)

    try {
      const result = await deleteUser(deletingUser.id)
      await reloadWindow()
      setDeletingUser(null)
      flashSuccess(result.message)
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Errore durante l'eliminazione dell'utente.",
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConfirmResend = async () => {
    if (!resendingUser) return
    setResendError('')
    setIsResending(true)

    try {
      const result = await resendUserCredentials(resendingUser.id)
      // The cognito_sub may have changed (re-invited account): refresh the list
      await reloadWindow()
      setResendingUser(null)
      flashSuccess(result.message)
    } catch (err) {
      setResendError(
        err instanceof Error ? err.message : 'Errore durante il rinvio delle credenziali.',
      )
    } finally {
      setIsResending(false)
    }
  }

  const handleConfirmStatus = async () => {
    if (!statusAction) return
    setStatusError('')
    setIsSavingStatus(true)

    try {
      const updated = await setUserStatus(statusAction.user.id, statusAction.target)
      await reloadWindow()
      setStatusAction(null)
      flashSuccess(`Utente ${updated.email} ${STATUS_ACTIONS[statusAction.target].successVerb}.`)
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : "Errore durante il cambio di stato dell'account.",
      )
    } finally {
      setIsSavingStatus(false)
    }
  }

  const statusCfg = statusAction ? STATUS_ACTIONS[statusAction.target] : null

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Gestione Utenti</h1>
          <p className="text-[0.95rem] text-slate-500">
            Crea, modifica ed elimina gli account autorizzati ad accedere all'applicazione.
          </p>
        </div>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(124,58,237,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(124,58,237,0.4)]"
          onClick={() => {
            setFormError('')
            setShowModal(true)
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          Nuovo Utente
        </button>
      </header>

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="users-org-filter">
            Organizzazione
          </label>
          <Select
            id="users-org-filter"
            className="min-w-[220px]"
            value={orgFilter}
            onChange={setOrgFilter}
            options={[{ value: '', label: 'Tutte le organizzazioni' }, ...orgOptions]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="users-role-filter">
            Ruolo
          </label>
          <Select
            id="users-role-filter"
            className="min-w-[180px]"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[{ value: '', label: 'Tutti i ruoli' }, ...ROLE_OPTIONS]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="users-status-filter">
            Stato
          </label>
          <Select
            id="users-status-filter"
            className="min-w-[160px]"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: 'Tutti gli stati' },
              ...(Object.keys(STATUS_LABELS) as UserStatus[]).map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
              })),
            ]}
          />
        </div>
        <div className={fieldCls}>
          <label className={labelCls} htmlFor="users-access-filter">
            Accesso
          </label>
          <Select
            id="users-access-filter"
            className="min-w-[180px]"
            value={accessFilter}
            onChange={setAccessFilter}
            options={ACCESS_OPTIONS}
          />
        </div>
        {(orgFilter || roleFilter || statusFilter || accessFilter) && (
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100"
            onClick={() => {
              setOrgFilter('')
              setRoleFilter('')
              setStatusFilter('')
              setAccessFilter('')
            }}
          >
            Azzera filtri
          </button>
        )}
      </div>

      {successMsg && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-400 [animation-duration:0.2s]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <Spinner />
          <p>Caricamento utenti del sistema...</p>
        </div>
      ) : (
        <>
          <DataTable
            columns={USER_COLUMNS}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Cerca per nome, email o organizzazione..."
            isEmpty={users.length === 0}
            emptyMessage={
              hasFilters ? 'Nessun utente corrisponde ai filtri.' : 'Nessun utente trovato.'
            }
          >
            {users.map((u) => {
              const isSelf = u.id === user?.id
              const isSystemAccount = u.cognito_sub.startsWith('mock-')
              const deleteDisabled = isSelf || isSystemAccount
              const isActive = u.status === 'active'

              // Azioni secondarie: restano nel kebab, con il motivo dell'eventuale blocco
              const statusBlockedReason = isSelf
                ? 'Non puoi modificare lo stato del tuo stesso account'
                : "Non è possibile modificare lo stato dell'account di sistema"
              const openStatusModal = (target: UserStatus) => {
                setStatusError('')
                setStatusAction({ user: u, target })
              }

              const menuItems: KebabMenuItem[] = []
              // La disabilitazione è definitiva: su un account già disabilitato
              // non resta alcuna transizione di stato possibile.
              if (u.status !== 'disabled') {
                const toggleTarget: UserStatus = u.status === 'suspended' ? 'active' : 'suspended'
                menuItems.push({
                  key: 'toggle',
                  label: toggleTarget === 'active' ? 'Riattiva account' : 'Sospendi account',
                  icon: toggleTarget === 'active' ? reactivateIcon : suspendIcon,
                  disabled: deleteDisabled,
                  disabledReason: statusBlockedReason,
                  onSelect: () => openStatusModal(toggleTarget),
                })
                menuItems.push({
                  key: 'disable',
                  label: 'Disabilita account',
                  icon: disableIcon,
                  danger: true,
                  disabled: deleteDisabled,
                  disabledReason: statusBlockedReason,
                  onSelect: () => openStatusModal('disabled'),
                })
              }
              menuItems.push({
                key: 'resend',
                label: 'Rinvia credenziali',
                icon: resendIcon,
                disabled: deleteDisabled || !isActive,
                disabledReason: isSelf
                  ? 'Non puoi rinviare le credenziali del tuo stesso account'
                  : isSystemAccount
                    ? "Non è possibile rinviare le credenziali dell'account di sistema"
                    : u.status === 'disabled'
                      ? "L'account è disabilitato definitivamente"
                      : "L'account è sospeso: riattivalo prima di rinviare le credenziali",
                onSelect: () => {
                  setResendError('')
                  setResendingUser(u)
                },
              })

              return (
                <Tr
                  key={u.id}
                  className={`cursor-pointer ${isActive ? '' : 'opacity-60'}`}
                  onClick={() => setViewingUser(u)}
                >
                  <Td>
                    <div className="flex items-center gap-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
                        {getInitials(u.nome, u.cognome, u.email)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-100">
                          {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                        </span>
                        <span className="text-[0.75rem] text-slate-500">{u.email}</span>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {u.organization_name ? (
                      <span className="text-[0.85rem] text-slate-300">{u.organization_name}</span>
                    ) : (
                      <span className="text-[0.75rem] italic text-slate-500">
                        Nessuna (super admin)
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span
                      className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[u.ruolo] ?? ''}`}
                    >
                      {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                    </span>
                  </Td>
                  <Td>
                    <span
                      className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${STATUS_BADGE_CLASSES[u.status] ?? ''}`}
                    >
                      {STATUS_LABELS[u.status] ?? u.status}
                    </span>
                  </Td>
                  <Td>
                    {u.last_login_at ? (
                      <Tooltip content={formatDateTime(u.last_login_at)}>
                        <span className="text-[0.85rem] text-slate-400">
                          {formatRelativeDay(u.last_login_at)}
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip content="L'invito è stato inviato ma l'utente non ha mai effettuato l'accesso.">
                        <span
                          className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${NEVER_ACCESSED_BADGE_CLASSES}`}
                        >
                          {NEVER_ACCESSED_LABEL}
                        </span>
                      </Tooltip>
                    )}
                  </Td>
                  <Td>
                    <span className="text-[0.85rem] text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('it-IT', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip content="Modifica utente">
                        <button
                          className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                          onClick={() => openEditModal(u)}
                          aria-label={`Modifica ${u.email}`}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                      </Tooltip>
                      <Tooltip
                        wrap
                        content={
                          isSelf
                            ? 'Non puoi eliminare il tuo stesso account'
                            : isSystemAccount
                              ? "Non è possibile eliminare l'account di sistema"
                              : 'Elimina utente'
                        }
                      >
                        <button
                          className={`${actionBtnCls} hover:border-red-500 hover:bg-red-500/10 hover:text-red-500`}
                          onClick={() => {
                            setDeleteError('')
                            setDeletingUser(u)
                          }}
                          disabled={deleteDisabled}
                          aria-label={`Elimina ${u.email}`}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </Tooltip>
                      <Tooltip wrap content="Altre azioni">
                        <KebabMenu
                          label={`Altre azioni per ${u.email}`}
                          items={menuItems}
                          buttonClassName={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                        />
                      </Tooltip>
                    </div>
                  </Td>
                </Tr>
              )
            })}
          </DataTable>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
            <span className="tabular-nums">
              {users.length} di {total} utenti
              {hasFilters ? ' che corrispondono ai filtri' : ''}
            </span>
            {users.length < total && (
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Spinner variant="button" />
                    Caricamento...
                  </>
                ) : (
                  `Carica altri ${Math.min(WINDOW_SIZE, total - users.length)}`
                )}
              </button>
            )}
          </div>
        </>
      )}

      {/* Dettaglio Utente (clic sulla riga) */}
      {viewingUser && (
        <DetailModal
          onClose={() => setViewingUser(null)}
          title={
            viewingUser.nome && viewingUser.cognome
              ? `${viewingUser.nome} ${viewingUser.cognome}`
              : viewingUser.email
          }
          subtitle={viewingUser.email}
          header={
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-sm font-bold text-white">
              {getInitials(viewingUser.nome, viewingUser.cognome, viewingUser.email)}
            </div>
          }
        >
          <DetailField label="Nome">{viewingUser.nome || '—'}</DetailField>
          <DetailField label="Cognome">{viewingUser.cognome || '—'}</DetailField>
          <DetailField label="Email">{viewingUser.email}</DetailField>
          <DetailField label="Organizzazione">
            {viewingUser.organization_name ?? (
              <span className="italic text-slate-500">Nessuna (super admin)</span>
            )}
          </DetailField>
          <DetailField label="Ruolo">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[viewingUser.ruolo] ?? ''}`}
            >
              {ROLE_LABELS[viewingUser.ruolo] ?? viewingUser.ruolo}
            </span>
          </DetailField>
          <DetailField label="Stato">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${STATUS_BADGE_CLASSES[viewingUser.status] ?? ''}`}
            >
              {STATUS_LABELS[viewingUser.status] ?? viewingUser.status}
            </span>
          </DetailField>
          <DetailField label="Ultimo accesso">
            {viewingUser.last_login_at ? (
              `${formatDateTime(viewingUser.last_login_at)} (${formatRelativeDay(viewingUser.last_login_at)})`
            ) : (
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${NEVER_ACCESSED_BADGE_CLASSES}`}
              >
                {NEVER_ACCESSED_LABEL}
              </span>
            )}
          </DetailField>
          <DetailField label="Data creazione">{formatDateTime(viewingUser.created_at)}</DetailField>
          <DetailField label="Ultimo aggiornamento">
            {formatDateTime(viewingUser.updated_at)}
          </DetailField>
          <DetailField label="ID utente" mono>
            {viewingUser.id}
          </DetailField>
          <DetailField label="Cognito Sub" mono>
            {viewingUser.cognito_sub}
          </DetailField>
        </DetailModal>
      )}

      {/* Modal Creazione Utente */}
      {showModal && (
        <div className={overlayCls} onClick={() => !isSubmitting && setShowModal(false)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button
              className={modalCloseCls}
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
                Crea Nuovo Utente
              </h2>
              <p className="text-[0.85rem] text-slate-500">
                L'utente verrà registrato su AWS Cognito e riceverà la password temporanea via
                email.
              </p>
            </div>

            {formError && <FormError message={formError} />}

            <form className="flex flex-col gap-4" onSubmit={handleCreateUser}>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="admin-email">
                  Email
                </label>
                <div className={inputWrapperCls}>
                  <input
                    type="email"
                    id="admin-email"
                    className={inputCls}
                    placeholder="nuovo@utente.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="admin-nome">
                    Nome
                  </label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="admin-nome"
                      className={inputCls}
                      placeholder="Mario"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="admin-cognome">
                    Cognome
                  </label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="admin-cognome"
                      className={inputCls}
                      placeholder="Rossi"
                      value={cognome}
                      onChange={(e) => setCognome(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="admin-ruolo">
                  Ruolo del sistema
                </label>
                <Select
                  id="admin-ruolo"
                  value={ruolo}
                  onChange={(value) => setRuolo(value as RoleName)}
                  options={ROLE_OPTIONS}
                  disabled={isSubmitting}
                />
              </div>

              {ruolo !== 'super_admin' && (
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="admin-org">
                    Organizzazione
                  </label>
                  <Select
                    id="admin-org"
                    value={orgId}
                    onChange={setOrgId}
                    options={orgOptions}
                    disabled={isSubmitting}
                  />
                  {orgOptions.length === 0 && (
                    <p className="text-[0.7rem] text-amber-400">
                      Nessuna organizzazione disponibile: creane una prima di aggiungere utenti.
                    </p>
                  )}
                </div>
              )}

              <button type="submit" className={submitBtnCls} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner variant="button" />
                    Creazione su Cognito...
                  </>
                ) : (
                  'Crea Utente'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifica Utente */}
      {editingUser && (
        <div className={overlayCls} onClick={() => !isSavingEdit && setEditingUser(null)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button
              className={modalCloseCls}
              onClick={() => setEditingUser(null)}
              disabled={isSavingEdit}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">
                Modifica Utente
              </h2>
              <p className="text-[0.85rem] text-slate-500">{editingUser.email}</p>
            </div>

            {editError && <FormError message={editError} />}

            <form className="flex flex-col gap-4" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="edit-nome">
                    Nome
                  </label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="edit-nome"
                      className={inputCls}
                      placeholder="Mario"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      required
                      disabled={isSavingEdit}
                    />
                  </div>
                </div>

                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="edit-cognome">
                    Cognome
                  </label>
                  <div className={inputWrapperCls}>
                    <input
                      type="text"
                      id="edit-cognome"
                      className={inputCls}
                      placeholder="Rossi"
                      value={editCognome}
                      onChange={(e) => setEditCognome(e.target.value)}
                      required
                      disabled={isSavingEdit}
                    />
                  </div>
                </div>
              </div>

              <div className={fieldCls}>
                <label className={labelCls} htmlFor="edit-ruolo">
                  Ruolo del sistema
                </label>
                <Select
                  id="edit-ruolo"
                  value={editRuolo}
                  onChange={(value) => setEditRuolo(value as RoleName)}
                  options={ROLE_OPTIONS}
                  disabled={
                    isSavingEdit ||
                    editingUser.id === user?.id ||
                    editingUser.cognito_sub.startsWith('mock-')
                  }
                />
                {(editingUser.id === user?.id || editingUser.cognito_sub.startsWith('mock-')) && (
                  <p className="text-[0.7rem] text-slate-500">
                    {editingUser.id === user?.id
                      ? 'Non puoi modificare il ruolo del tuo stesso account.'
                      : "Il ruolo dell'account di sistema non è modificabile."}
                  </p>
                )}
              </div>

              {editRuolo !== 'super_admin' && (
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="edit-org">
                    Organizzazione
                  </label>
                  <Select
                    id="edit-org"
                    value={editOrgId}
                    onChange={setEditOrgId}
                    options={orgOptions}
                    disabled={isSavingEdit || editingUser.cognito_sub.startsWith('mock-')}
                  />
                </div>
              )}

              <button type="submit" className={submitBtnCls} disabled={isSavingEdit}>
                {isSavingEdit ? (
                  <>
                    <Spinner variant="button" />
                    Salvataggio...
                  </>
                ) : (
                  'Salva Modifiche'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Conferma Cambio Stato (sospendi / riattiva / disabilita) */}
      {statusAction && statusCfg && (
        <ConfirmModal
          icon={statusCfg.icon}
          iconWrapperCls={statusCfg.iconWrapperCls}
          title={statusCfg.title}
          description={statusCfg.description(statusAction.user.email)}
          error={statusError || undefined}
          confirmLabel={statusCfg.confirmLabel}
          pendingLabel={statusCfg.pendingLabel}
          confirmClassName={statusCfg.confirmCls}
          isPending={isSavingStatus}
          onConfirm={handleConfirmStatus}
          onClose={() => setStatusAction(null)}
        />
      )}

      {/* Modal Conferma Rinvio Credenziali */}
      {resendingUser && (
        <ConfirmModal
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
            </svg>
          }
          iconWrapperCls="border border-cyan-500/25 bg-cyan-500/10"
          title="Rinvia Credenziali"
          description={
            <>
              Cognito invierà a <strong className="text-slate-100">{resendingUser.email}</strong>{' '}
              una nuova password temporanea via email. Le credenziali attuali smetteranno subito di
              funzionare e al prossimo accesso l'utente dovrà impostare una nuova password.
            </>
          }
          error={resendError || undefined}
          confirmLabel="Invia Nuova Password"
          pendingLabel="Invio in corso..."
          confirmClassName="border-none bg-gradient-to-br from-violet-600 to-cyan-500 text-white hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0"
          isPending={isResending}
          onConfirm={handleConfirmResend}
          onClose={() => setResendingUser(null)}
        />
      )}

      {/* Modal Conferma Eliminazione */}
      {deletingUser && (
        <ConfirmModal
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          }
          iconWrapperCls="border border-red-500/25 bg-red-500/10"
          title="Elimina Utente"
          description={
            <>
              Stai per eliminare <strong className="text-slate-100">{deletingUser.email}</strong> da
              Cognito e dal database, incluse le sue conversazioni. L'operazione non è reversibile.
            </>
          }
          error={deleteError || undefined}
          confirmLabel="Elimina Definitivamente"
          pendingLabel="Eliminazione..."
          confirmClassName="border-none bg-red-500 text-white hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)]"
          isPending={isDeleting}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingUser(null)}
        />
      )}
    </div>
  )
}
