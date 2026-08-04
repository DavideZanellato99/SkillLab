import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import {
  useAdminUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useResendUserCredentials,
  useSetUserStatus,
  USERS_WINDOW_SIZE,
} from '../hooks/useAdminUsers'
import { useOrganizations } from '../hooks/useOrganizations'
import { isSuperAdmin, ROLE_LABELS, ROLE_BADGE_CLASSES, getInitials } from '../services/auth'
import type { RoleName, UserStatus } from '../services/auth'
import type { AdminUser } from '../services/admin'
import Select from './Select'
import DataTable, { Td, Tr } from './DataTable'
import DetailModal, { DetailField } from './DetailModal'
import AuthorshipFields from './AuthorshipFields'
import Tooltip from './Tooltip'
import KebabMenu from './KebabMenu'
import Spinner from './Spinner'
import LoadingState from './LoadingState'
import { PageContainer, PageHeader } from './PageLayout'
import Badge from './Badge'
import PrimaryButton from './PrimaryButton'
import FormError from './FormError'
import ConfirmModal from './ConfirmModal'
import ModalShell, { ModalHeader } from './ModalShell'
import { TrashIcon, ResendIcon, UserPlusIcon, PencilIcon } from './icons'
import { formatDate, formatDateTime, formatRelativeDay, NEVER_ACCESSED_LABEL } from './lastAccess'
import type { KebabMenuItem } from './KebabMenu'
import Field, { fieldCls, labelCls, TextInput } from './Field'
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

const ACCESS_OPTIONS = [
  { value: '', label: 'Qualsiasi accesso' },
  { value: 'never', label: 'Mai acceduto' },
  { value: 'done', label: 'Ha già acceduto' },
]

/* Shared form styles (modals, same look as the auth modal) */
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40'

export default function AdminPage() {
  const { user } = useAuth()
  const { data: organizations = [] } = useOrganizations(isSuperAdmin(user))
  const [successMsg, setSuccessMsg] = useState('')

  // Filtri e ricerca: girano tutti sul server, quindi coprono l'intero
  // elenco e non solo la finestra già caricata.
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  /* Il filtro organizzazione vive anche nell'URL (?organization_id=...): è
   * così che il dettaglio di un'organizzazione può linkare "i suoi utenti",
   * e un ricaricamento o un link condiviso riaprono la pagina già filtrata. */
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

  /* La finestra di utenti: i filtri stanno nella chiave, quindi cambiarne uno
   * riparte da capo, mentre "carica altri" aggiunge una pagina a quelle già
   * lette. Dopo una scrittura le mutation invalidano, e TanStack rilegge
   * tutte le pagine caricate: la finestra resta dov'era. */
  const {
    users,
    total,
    isPending: isLoading,
    error: loadError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: isLoadingMore,
  } = useAdminUsers(
    {
      organizationId: orgFilter,
      ruolo: (roleFilter || undefined) as RoleName | undefined,
      status: (statusFilter || undefined) as UserStatus | undefined,
      neverLoggedIn: accessFilter === '' ? undefined : accessFilter === 'never',
      search: debouncedSearch,
    },
    isSuperAdmin(user),
  )

  const createMutation = useCreateUser()
  const updateMutation = useUpdateUser()
  const deleteMutation = useDeleteUser()
  const resendMutation = useResendUserCredentials()
  const statusMutation = useSetUserStatus()

  /** Messaggio di una mutation fallita, con il testo di ripiego che le
   *  spetta: gli errori non stanno più in stati paralleli. */
  const errorOf = (error: unknown, fallback: string) =>
    error ? (error instanceof Error ? error.message : fallback) : ''

  // Create form states
  const [showModal, setShowModal] = useState(false)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [cognome, setCognome] = useState('')
  const [ruolo, setRuolo] = useState<RoleName>('user')
  const [orgId, setOrgId] = useState('')
  /* La creazione ha una regola che il server non conosce (un utente non super
   * admin deve avere un'organizzazione): quel messaggio nasce qui, quindi
   * convive con quello della mutation. */
  const [formValidationError, setFormValidationError] = useState('')
  const formError =
    formValidationError || errorOf(createMutation.error, "Errore durante la creazione dell'utente.")

  // Detail view (clic sulla riga): utente in sola lettura
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null)

  // Edit form states
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCognome, setEditCognome] = useState('')
  const [editRuolo, setEditRuolo] = useState<RoleName>('user')
  const [editOrgId, setEditOrgId] = useState('')
  const [editValidationError, setEditValidationError] = useState('')
  const editError =
    editValidationError ||
    errorOf(updateMutation.error, "Errore durante l'aggiornamento dell'utente.")

  // Delete confirmation states
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null)

  // Resend-credentials confirmation states
  const [resendingUser, setResendingUser] = useState<AdminUser | null>(null)

  // Account-status confirmation states (`target` = the status being applied)
  const [statusAction, setStatusAction] = useState<{ user: AdminUser; target: UserStatus } | null>(
    null,
  )

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 6000)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormValidationError('')
    createMutation.reset()

    // A user/organization_admin must belong to an organization
    if (ruolo !== 'super_admin' && !orgId) {
      setFormValidationError("Seleziona l'organizzazione dell'utente.")
      return
    }

    try {
      const created = await createMutation.mutateAsync({
        email,
        nome,
        cognome,
        ruolo,
        organization_id: ruolo === 'super_admin' ? null : orgId,
      })
      setShowModal(false)
      setEmail('')
      setNome('')
      setCognome('')
      setRuolo('user')
      setOrgId('')
      flashSuccess(
        `Utente ${created.email} creato con successo! Un'email con la password temporanea è stata inviata via Cognito.`,
      )
    } catch {
      // Il messaggio è nella mutation, la modale resta aperta a mostrarlo
    }
  }

  const openEditModal = (u: AdminUser) => {
    setEditingUser(u)
    setEditNome(u.nome)
    setEditCognome(u.cognome)
    setEditRuolo(u.ruolo as RoleName)
    setEditOrgId(u.organization_id ?? '')
    setEditValidationError('')
    updateMutation.reset()
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditValidationError('')
    updateMutation.reset()

    if (editRuolo !== 'super_admin' && !editOrgId) {
      setEditValidationError("Seleziona l'organizzazione dell'utente.")
      return
    }

    try {
      const updated = await updateMutation.mutateAsync({
        userId: editingUser.id,
        payload: {
          nome: editNome,
          cognome: editCognome,
          ruolo: editRuolo,
          organization_id: editRuolo === 'super_admin' ? null : editOrgId,
        },
      })
      setEditingUser(null)
      flashSuccess(`Utente ${updated.email} aggiornato con successo.`)
    } catch {
      // idem
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingUser) return
    try {
      const result = await deleteMutation.mutateAsync(deletingUser.id)
      setDeletingUser(null)
      flashSuccess(result.message)
    } catch {
      // idem
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
          <PrimaryButton
            icon={<UserPlusIcon size={18} />}
            onClick={() => {
              setFormValidationError('')
              createMutation.reset()
              setShowModal(true)
            }}
          >
            Nuovo Utente
          </PrimaryButton>
        }
      />

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

      {loadError && (
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
          <span>{errorOf(loadError, 'Impossibile caricare gli utenti.')}</span>
        </div>
      )}

      {isLoading ? (
        <LoadingState message="Caricamento utenti del sistema..." />
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
                statusMutation.reset()
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
                  resendMutation.reset()
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
                    <Badge tone={ROLE_BADGE_CLASSES[u.ruolo] ?? ''}>
                      {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_BADGE_CLASSES[u.status] ?? ''}>
                      {STATUS_LABELS[u.status] ?? u.status}
                    </Badge>
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
                        <Badge tone={NEVER_ACCESSED_BADGE_CLASSES}>{NEVER_ACCESSED_LABEL}</Badge>
                      </Tooltip>
                    )}
                  </Td>
                  <Td>
                    <span className="text-[0.85rem] text-slate-500">
                      {formatDate(u.created_at)}
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
                          <PencilIcon />
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
                            deleteMutation.reset()
                            setDeletingUser(u)
                          }}
                          disabled={deleteDisabled}
                          aria-label={`Elimina ${u.email}`}
                        >
                          <TrashIcon />
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
            {hasNextPage && (
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => fetchNextPage()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <>
                    <Spinner variant="button" />
                    Caricamento...
                  </>
                ) : (
                  `Carica altri ${Math.min(USERS_WINDOW_SIZE, total - users.length)}`
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
            <Badge tone={ROLE_BADGE_CLASSES[viewingUser.ruolo] ?? ''}>
              {ROLE_LABELS[viewingUser.ruolo] ?? viewingUser.ruolo}
            </Badge>
          </DetailField>
          <DetailField label="Stato">
            <Badge tone={STATUS_BADGE_CLASSES[viewingUser.status] ?? ''}>
              {STATUS_LABELS[viewingUser.status] ?? viewingUser.status}
            </Badge>
          </DetailField>
          <DetailField label="Ultimo accesso">
            {viewingUser.last_login_at ? (
              `${formatDateTime(viewingUser.last_login_at)} (${formatRelativeDay(viewingUser.last_login_at)})`
            ) : (
              <Badge tone={NEVER_ACCESSED_BADGE_CLASSES}>{NEVER_ACCESSED_LABEL}</Badge>
            )}
          </DetailField>
          {/* L'accesso dice quando la sessione è nata, questa quando è stata
              usata l'ultima volta: su una sessione che si rinnova da sola le
              due date possono distare settimane. Conta solo quello che fa una
              persona, non il ricontrollo automatico della campanella, e si
              aggiorna a intervalli di pochi minuti: l'orario è preciso quanto
              basta a dire "adesso" e non va letto al secondo. */}
          <DetailField label="Ultima attività">
            {viewingUser.last_activity_at
              ? `${formatDateTime(viewingUser.last_activity_at)} (${formatRelativeDay(viewingUser.last_activity_at)})`
              : '—'}
          </DetailField>
          <AuthorshipFields row={viewingUser} />
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
        <ModalShell onClose={() => setShowModal(false)} locked={createMutation.isPending}>
          <ModalHeader
            iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
            icon={
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
            }
            title="Crea Nuovo Utente"
            description={
              <>
                L'utente verrà registrato su AWS Cognito e riceverà la password temporanea via
                email.
              </>
            }
            className="mb-8"
          />

          {formError && <FormError message={formError} />}

          <form className="flex flex-col gap-4" onSubmit={handleCreateUser}>
            <Field label="Email" htmlFor="admin-email">
              <TextInput
                type="email"
                id="admin-email"
                placeholder="nuovo@utente.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={createMutation.isPending}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome" htmlFor="admin-nome">
                <TextInput
                  type="text"
                  id="admin-nome"
                  placeholder="Mario"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                />
              </Field>

              <Field label="Cognome" htmlFor="admin-cognome">
                <TextInput
                  type="text"
                  id="admin-cognome"
                  placeholder="Rossi"
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  required
                  disabled={createMutation.isPending}
                />
              </Field>
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
                disabled={createMutation.isPending}
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
                  disabled={createMutation.isPending}
                />
                {orgOptions.length === 0 && (
                  <p className="text-[0.7rem] text-amber-400">
                    Nessuna organizzazione disponibile: creane una prima di aggiungere utenti.
                  </p>
                )}
              </div>
            )}

            <PrimaryButton
              type="submit"
              variant="submit"
              className="mt-4"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Spinner variant="button" />
                  Creazione su Cognito...
                </>
              ) : (
                'Crea Utente'
              )}
            </PrimaryButton>
          </form>
        </ModalShell>
      )}

      {/* Modal Modifica Utente */}
      {editingUser && (
        <ModalShell onClose={() => setEditingUser(null)} locked={updateMutation.isPending}>
          <ModalHeader
            iconWrapperCls="border border-violet-600/20 bg-violet-600/10"
            icon={<PencilIcon size={24} stroke="#7c3aed" />}
            title="Modifica Utente"
            description={<>{editingUser.email}</>}
            className="mb-8"
          />

          {editError && <FormError message={editError} />}

          <form className="flex flex-col gap-4" onSubmit={handleSaveEdit}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome" htmlFor="edit-nome">
                <TextInput
                  type="text"
                  id="edit-nome"
                  placeholder="Mario"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                  disabled={updateMutation.isPending}
                />
              </Field>

              <Field label="Cognome" htmlFor="edit-cognome">
                <TextInput
                  type="text"
                  id="edit-cognome"
                  placeholder="Rossi"
                  value={editCognome}
                  onChange={(e) => setEditCognome(e.target.value)}
                  required
                  disabled={updateMutation.isPending}
                />
              </Field>
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
                  updateMutation.isPending ||
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
                  disabled={updateMutation.isPending || editingUser.cognito_sub.startsWith('mock-')}
                />
              </div>
            )}

            <PrimaryButton
              type="submit"
              variant="submit"
              className="mt-4"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Spinner variant="button" />
                  Salvataggio...
                </>
              ) : (
                'Salva Modifiche'
              )}
            </PrimaryButton>
          </form>
        </ModalShell>
      )}

      {/* Modal Conferma Cambio Stato (sospendi / riattiva / disabilita) */}
      {statusAction && statusCfg && (
        <ConfirmModal
          icon={statusCfg.icon}
          iconWrapperCls={statusCfg.iconWrapperCls}
          title={statusCfg.title}
          description={statusCfg.description(statusAction.user.email)}
          error={
            errorOf(statusMutation.error, "Errore durante il cambio di stato dell'account.") ||
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

      {/* Modal Conferma Rinvio Credenziali */}
      {resendingUser && (
        <ConfirmModal
          icon={<ResendIcon size={24} stroke="#06b6d4" />}
          iconWrapperCls="border border-cyan-500/25 bg-cyan-500/10"
          title="Rinvia Credenziali"
          description={
            <>
              Cognito invierà a <strong className="text-slate-100">{resendingUser.email}</strong>{' '}
              una nuova password temporanea via email. Le credenziali attuali smetteranno subito di
              funzionare e al prossimo accesso l'utente dovrà impostare una nuova password.
            </>
          }
          error={
            errorOf(resendMutation.error, 'Errore durante il rinvio delle credenziali.') ||
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

      {/* Modal Conferma Eliminazione */}
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
            errorOf(deleteMutation.error, "Errore durante l'eliminazione dell'utente.") || undefined
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
