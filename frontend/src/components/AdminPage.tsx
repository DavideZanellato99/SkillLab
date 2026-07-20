import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllUsers, createNewUser, updateUser, deleteUser, resendUserCredentials, setUserStatus } from '../services/admin';
import { isSuperAdmin, ROLE_LABELS, ROLE_BADGE_CLASSES, getInitials } from '../services/auth';
import type { AuthUser, RoleName, UserStatus } from '../services/auth';
import Select from './Select';
import DataTable, { Td, Tr } from './DataTable';
import Tooltip from './Tooltip';
import { matchesSearch } from './tableSearch';
import type { DataTableColumn } from './DataTable';

/* Shared form styles (modals, same look as the auth modal) */
const fieldCls = 'flex flex-col gap-1.5';
const labelCls = 'text-xs font-medium tracking-wide text-slate-400';
const inputWrapperCls =
  'flex items-center gap-2 rounded-xl border border-white/6 bg-slate-800/50 px-4 transition focus-within:border-violet-600 focus-within:shadow-[0_0_0_3px_rgba(124,58,237,0.1)]';
const inputCls =
  'flex-1 border-none bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50';
const submitBtnCls =
  'mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
const overlayCls =
  'fixed inset-0 z-[200] flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-lg [animation-duration:0.2s]';
const modalCls =
  'relative max-h-[90vh] w-full max-w-[420px] animate-modal-in overflow-y-auto rounded-3xl border border-white/6 bg-gray-900/95 p-12 shadow-[0_24px_80px_rgba(0,0,0,0.5),0_0_60px_rgba(124,58,237,0.08)] backdrop-blur-2xl max-[480px]:rounded-2xl max-[480px]:p-8';
const modalCloseCls =
  'absolute right-4 top-4 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-slate-100';
const formErrorCls =
  'mb-4 flex animate-fade-in-up items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-2 text-[0.82rem] text-red-300 [animation-duration:0.2s]';
const spinnerCls = 'h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white';
const actionBtnCls =
  'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/6 bg-white/4 text-slate-400 transition disabled:cursor-not-allowed disabled:opacity-40';

const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'organization_admin', label: 'Organization Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Attivo',
  suspended: 'Sospeso',
  disabled: 'Disabilitato',
};

const STATUS_BADGE_CLASSES: Record<UserStatus, string> = {
  active: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  suspended: 'border border-amber-500/30 bg-amber-500/10 text-amber-400',
  disabled: 'border border-red-500/30 bg-red-500/10 text-red-400',
};

const USER_COLUMNS: DataTableColumn[] = [
  { key: 'utente', label: 'Utente' },
  { key: 'email', label: 'Email' },
  { key: 'ruolo', label: 'Ruolo' },
  { key: 'stato', label: 'Stato' },
  { key: 'creazione', label: 'Data Creazione' },
  { key: 'azioni', label: 'Azioni', align: 'right' },
];

function ErrorBox({ message }: { message: string }) {
  return (
    <div className={formErrorCls}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0 text-red-500">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [search, setSearch] = useState('');

  const visibleUsers = users.filter((u) =>
    matchesSearch(
      search,
      `${u.nome ?? ''} ${u.cognome ?? ''}`,
      u.email,
      ROLE_LABELS[u.ruolo] ?? u.ruolo,
      STATUS_LABELS[u.status] ?? u.status,
    ),
  );

  // Create form states
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [ruolo, setRuolo] = useState<RoleName>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Edit form states
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCognome, setEditCognome] = useState('');
  const [editRuolo, setEditRuolo] = useState<RoleName>('user');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete confirmation states
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Resend-credentials confirmation states
  const [resendingUser, setResendingUser] = useState<AuthUser | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendError, setResendError] = useState('');

  // Account-status modal states (pendingStatus = the transition in flight)
  const [statusUser, setStatusUser] = useState<AuthUser | null>(null);
  const [pendingStatus, setPendingStatus] = useState<UserStatus | null>(null);
  const [statusError, setStatusError] = useState('');

  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 6000);
  };

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile caricare gli utenti.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin(user)) {
      loadUsers();
    }
  }, [user, loadUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const created = await createNewUser({
        email,
        nome,
        cognome,
        ruolo,
      });
      setUsers((prev) => [created, ...prev]);
      setShowModal(false);
      setEmail('');
      setNome('');
      setCognome('');
      setRuolo('user');
      flashSuccess(`Utente ${created.email} creato con successo! Un'email con la password temporanea è stata inviata via Cognito.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore durante la creazione dell'utente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (u: AuthUser) => {
    setEditingUser(u);
    setEditNome(u.nome);
    setEditCognome(u.cognome);
    setEditRuolo(u.ruolo as RoleName);
    setEditError('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');
    setIsSavingEdit(true);

    try {
      const updated = await updateUser(editingUser.id, {
        nome: editNome,
        cognome: editCognome,
        ruolo: editRuolo,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setEditingUser(null);
      flashSuccess(`Utente ${updated.email} aggiornato con successo.`);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Errore durante l'aggiornamento dell'utente.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setDeleteError('');
    setIsDeleting(true);

    try {
      const result = await deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setDeletingUser(null);
      flashSuccess(result.message);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore durante l'eliminazione dell'utente.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmResend = async () => {
    if (!resendingUser) return;
    setResendError('');
    setIsResending(true);

    try {
      const result = await resendUserCredentials(resendingUser.id);
      setResendingUser(null);
      flashSuccess(result.message);
      // The cognito_sub may have changed (re-invited account): refresh the list
      loadUsers();
    } catch (err) {
      setResendError(err instanceof Error ? err.message : "Errore durante il rinvio delle credenziali.");
    } finally {
      setIsResending(false);
    }
  };

  const handleSetStatus = async (newStatus: UserStatus) => {
    if (!statusUser || pendingStatus) return;
    setStatusError('');
    setPendingStatus(newStatus);

    try {
      const updated = await setUserStatus(statusUser.id, newStatus);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setStatusUser(null);
      const verbs: Record<UserStatus, string> = {
        active: 'riattivato',
        suspended: 'sospeso',
        disabled: 'disabilitato definitivamente',
      };
      flashSuccess(`Utente ${updated.email} ${verbs[newStatus]}.`);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Errore durante il cambio di stato dell'account.");
    } finally {
      setPendingStatus(null);
    }
  };

  if (!isSuperAdmin(user)) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/6 bg-gray-900/60 p-16 text-center text-red-300">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2 className="font-heading text-2xl text-slate-100">Accesso Negato</h2>
          <p className="max-w-[400px] text-slate-400">Solo gli utenti con ruolo <strong>Super Admin</strong> possono accedere alla gestione utenti.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-12">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="mb-1 font-heading text-3xl font-bold text-slate-100">Gestione Utenti</h1>
          <p className="text-[0.95rem] text-slate-500">Crea, modifica ed elimina gli account autorizzati ad accedere all'applicazione.</p>
        </div>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-6 py-2 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(124,58,237,0.25)] transition hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(124,58,237,0.4)]"
          onClick={() => {
            setFormError('');
            setShowModal(true);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          Nuovo Utente
        </button>
      </header>

      {successMsg && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-4 text-sm text-emerald-400 [animation-duration:0.2s]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="mb-8 flex animate-fade-in-up items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-300 [animation-duration:0.2s]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center gap-4 p-16 text-slate-500">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-600/15 border-t-violet-600" />
          <p>Caricamento utenti del sistema...</p>
        </div>
      ) : (
        <DataTable
          columns={USER_COLUMNS}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Cerca per nome, email, ruolo o stato..."
          isEmpty={visibleUsers.length === 0}
          emptyMessage={search ? 'Nessun utente corrisponde alla ricerca.' : 'Nessun utente trovato.'}
        >
          {visibleUsers.map((u) => {
            const isSelf = u.id === user?.id;
            const isSystemAccount = u.cognito_sub.startsWith('mock-');
            const deleteDisabled = isSelf || isSystemAccount;
            const isActive = u.status === 'active';
            return (
              <Tr key={u.id} className={isActive ? '' : 'opacity-60'}>
                <Td>
                  <div className="flex items-center gap-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-cyan-500 text-xs font-bold text-white">
                      {getInitials(u.nome, u.cognome, u.email)}
                    </div>
                    <span className="font-semibold text-slate-100">
                      {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                    </span>
                  </div>
                </Td>
                <Td><span className="text-slate-400">{u.email}</span></Td>
                <Td>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${ROLE_BADGE_CLASSES[u.ruolo] ?? ''}`}>
                    {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                  </span>
                </Td>
                <Td>
                  <span className={`w-fit rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${STATUS_BADGE_CLASSES[u.status] ?? ''}`}>
                    {STATUS_LABELS[u.status] ?? u.status}
                  </span>
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
                <Td>
                  <div className="flex items-center justify-end gap-2">
                    <Tooltip content="Modifica utente">
                      <button
                        className={`${actionBtnCls} hover:border-violet-600 hover:bg-violet-600/12 hover:text-violet-400`}
                        onClick={() => openEditModal(u)}
                        aria-label={`Modifica ${u.email}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip
                      wrap
                      content={
                        isSelf
                          ? 'Non puoi modificare lo stato del tuo stesso account'
                          : isSystemAccount
                            ? "Non è possibile modificare lo stato dell'account di sistema"
                            : u.status === 'disabled'
                              ? 'Account disabilitato definitivamente'
                              : u.status === 'suspended'
                                ? "Riattiva o disabilita l'account"
                                : "Sospendi o disabilita l'account"
                      }
                    >
                      <button
                        className={`${actionBtnCls} hover:border-amber-500 hover:bg-amber-500/10 hover:text-amber-400`}
                        onClick={() => { setStatusError(''); setStatusUser(u); }}
                        disabled={deleteDisabled || u.status === 'disabled'}
                        aria-label={`Stato account di ${u.email}`}
                      >
                        {/* Ban icon (circle-slash) */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                        </svg>
                      </button>
                    </Tooltip>
                    <Tooltip
                      wrap
                      content={
                        isSelf
                          ? 'Non puoi rinviare le credenziali del tuo stesso account'
                          : isSystemAccount
                            ? "Non è possibile rinviare le credenziali dell'account di sistema"
                            : !isActive
                              ? "L'account non è attivo: riattivalo prima di rinviare le credenziali"
                              : 'Rinvia credenziali via Cognito'
                      }
                    >
                      <button
                        className={`${actionBtnCls} hover:border-cyan-500 hover:bg-cyan-500/10 hover:text-cyan-400`}
                        onClick={() => { setResendError(''); setResendingUser(u); }}
                        disabled={deleteDisabled || !isActive}
                        aria-label={`Rinvia credenziali a ${u.email}`}
                      >
                        {/* Key icon */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
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
                        onClick={() => { setDeleteError(''); setDeletingUser(u); }}
                        disabled={deleteDisabled}
                        aria-label={`Elimina ${u.email}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </Tooltip>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTable>
      )}

      {/* Modal Creazione Utente */}
      {showModal && (
        <div className={overlayCls} onClick={() => !isSubmitting && setShowModal(false)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button className={modalCloseCls} onClick={() => setShowModal(false)} disabled={isSubmitting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Crea Nuovo Utente</h2>
              <p className="text-[0.85rem] text-slate-500">
                L'utente verrà registrato su AWS Cognito e riceverà la password temporanea via email.
              </p>
            </div>

            {formError && <ErrorBox message={formError} />}

            <form className="flex flex-col gap-4" onSubmit={handleCreateUser}>
              <div className={fieldCls}>
                <label className={labelCls} htmlFor="admin-email">Email</label>
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
                  <label className={labelCls} htmlFor="admin-nome">Nome</label>
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
                  <label className={labelCls} htmlFor="admin-cognome">Cognome</label>
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
                <label className={labelCls} htmlFor="admin-ruolo">Ruolo del sistema</label>
                <Select
                  id="admin-ruolo"
                  value={ruolo}
                  onChange={(value) => setRuolo(value as RoleName)}
                  options={ROLE_OPTIONS}
                  disabled={isSubmitting}
                />
              </div>

              <button type="submit" className={submitBtnCls} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className={spinnerCls} />
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
            <button className={modalCloseCls} onClick={() => setEditingUser(null)} disabled={isSavingEdit}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-violet-600/20 bg-violet-600/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Modifica Utente</h2>
              <p className="text-[0.85rem] text-slate-500">{editingUser.email}</p>
            </div>

            {editError && <ErrorBox message={editError} />}

            <form className="flex flex-col gap-4" onSubmit={handleSaveEdit}>
              <div className="grid grid-cols-2 gap-3">
                <div className={fieldCls}>
                  <label className={labelCls} htmlFor="edit-nome">Nome</label>
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
                  <label className={labelCls} htmlFor="edit-cognome">Cognome</label>
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
                <label className={labelCls} htmlFor="edit-ruolo">Ruolo del sistema</label>
                <Select
                  id="edit-ruolo"
                  value={editRuolo}
                  onChange={(value) => setEditRuolo(value as RoleName)}
                  options={ROLE_OPTIONS}
                  disabled={isSavingEdit || editingUser.id === user?.id || editingUser.cognito_sub.startsWith('mock-')}
                />
                {(editingUser.id === user?.id || editingUser.cognito_sub.startsWith('mock-')) && (
                  <p className="text-[0.7rem] text-slate-500">
                    {editingUser.id === user?.id
                      ? 'Non puoi modificare il ruolo del tuo stesso account.'
                      : "Il ruolo dell'account di sistema non è modificabile."}
                  </p>
                )}
              </div>

              <button type="submit" className={submitBtnCls} disabled={isSavingEdit}>
                {isSavingEdit ? (
                  <>
                    <span className={spinnerCls} />
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

      {/* Modal Stato Account (sospendi / riattiva / disabilita) */}
      {statusUser && (
        <div className={overlayCls} onClick={() => !pendingStatus && setStatusUser(null)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button className={modalCloseCls} onClick={() => setStatusUser(null)} disabled={!!pendingStatus}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Stato Account</h2>
              <p className="text-[0.85rem] text-slate-500">
                {statusUser.status === 'suspended' ? (
                  <>
                    L'account di <strong className="text-slate-100">{statusUser.email}</strong> è sospeso:
                    puoi riattivarlo oppure disabilitarlo definitivamente.
                  </>
                ) : (
                  <>
                    Limita l'accesso di <strong className="text-slate-100">{statusUser.email}</strong>: la
                    sospensione è reversibile, la disabilitazione è definitiva. In entrambi i casi il login
                    viene bloccato e le sessioni aperte chiuse immediatamente.
                  </>
                )}
              </p>
            </div>

            {statusError && <ErrorBox message={statusError} />}

            <div className="flex flex-col gap-3">
              {statusUser.status === 'suspended' ? (
                <button
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => handleSetStatus('active')}
                  disabled={!!pendingStatus}
                >
                  {pendingStatus === 'active' ? (
                    <>
                      <span className={spinnerCls} />
                      Riattivazione...
                    </>
                  ) : (
                    "Riattiva l'Account"
                  )}
                </button>
              ) : (
                <button
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => handleSetStatus('suspended')}
                  disabled={!!pendingStatus}
                >
                  {pendingStatus === 'suspended' ? (
                    <>
                      <span className={spinnerCls} />
                      Sospensione...
                    </>
                  ) : (
                    'Sospendi (reversibile)'
                  )}
                </button>
              )}
              <button
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => handleSetStatus('disabled')}
                disabled={!!pendingStatus}
              >
                {pendingStatus === 'disabled' ? (
                  <>
                    <span className={spinnerCls} />
                    Disabilitazione...
                  </>
                ) : (
                  'Disabilita Definitivamente'
                )}
              </button>
              <button
                className="flex cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setStatusUser(null)}
                disabled={!!pendingStatus}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Rinvio Credenziali */}
      {resendingUser && (
        <div className={overlayCls} onClick={() => !isResending && setResendingUser(null)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button className={modalCloseCls} onClick={() => setResendingUser(null)} disabled={isResending}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Rinvia Credenziali</h2>
              <p className="text-[0.85rem] text-slate-500">
                Cognito invierà a <strong className="text-slate-100">{resendingUser.email}</strong> una nuova
                password temporanea via email. Le credenziali attuali smetteranno subito di funzionare e al
                prossimo accesso l'utente dovrà impostare una nuova password.
              </p>
            </div>

            {resendError && <ErrorBox message={resendError} />}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setResendingUser(null)}
                disabled={isResending}
              >
                Annulla
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-gradient-to-br from-violet-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmResend}
                disabled={isResending}
              >
                {isResending ? (
                  <>
                    <span className={spinnerCls} />
                    Invio in corso...
                  </>
                ) : (
                  'Invia Nuova Password'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Conferma Eliminazione */}
      {deletingUser && (
        <div className={overlayCls} onClick={() => !isDeleting && setDeletingUser(null)}>
          <div className={modalCls} onClick={(e) => e.stopPropagation()}>
            <button className={modalCloseCls} onClick={() => setDeletingUser(null)} disabled={isDeleting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </div>
              <h2 className="mb-1 font-heading text-[1.4rem] font-bold text-slate-100 max-[480px]:text-xl">Elimina Utente</h2>
              <p className="text-[0.85rem] text-slate-500">
                Stai per eliminare <strong className="text-slate-100">{deletingUser.email}</strong> da Cognito e dal database,
                incluse le sue conversazioni. L'operazione non è reversibile.
              </p>
            </div>

            {deleteError && <ErrorBox message={deleteError} />}

            <div className="flex gap-3">
              <button
                className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-white/6 bg-white/4 px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-white/8 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setDeletingUser(null)}
                disabled={isDeleting}
              >
                Annulla
              </button>
              <button
                className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 hover:shadow-[0_6px_20px_rgba(239,68,68,0.35)] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className={spinnerCls} />
                    Eliminazione...
                  </>
                ) : (
                  'Elimina Definitivamente'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
