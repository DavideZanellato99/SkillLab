import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchAllUsers, createNewUser } from '../services/admin';
import { isAdminUser, ROLE_LABELS } from '../services/auth';
import type { AuthUser, RoleName } from '../services/auth';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [ruolo, setRuolo] = useState<RoleName>('user');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

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
    if (isAdminUser(user)) {
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
      setSuccessMsg(`Utente ${created.email} creato con successo! Un'email con la password temporanea è stata inviata via Cognito.`);
      setTimeout(() => setSuccessMsg(''), 6000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Errore durante la creazione dell'utente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAdminUser(user)) {
    return (
      <div className="admin-container">
        <div className="admin-access-denied">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h2>Accesso Negato</h2>
          <p>Solo gli utenti con ruolo <strong>Admin</strong> possono accedere alla gestione utenti.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <header className="admin-header">
        <div>
          <h1 className="admin-title">Gestione Utenti</h1>
          <p className="admin-subtitle">Crea e visualizza gli account autorizzati ad accedere all'applicazione.</p>
        </div>
        <button
          className="admin-create-btn"
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
        <div className="admin-alert admin-alert-success">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="admin-alert admin-alert-error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="admin-loading">
          <div className="auth-loading-spinner" />
          <p>Caricamento utenti del sistema...</p>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Utente</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Cognito Sub</th>
                <th>Data Creazione</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-table-empty">Nessun utente trovato.</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className="user-avatar-small">
                          {(u.nome || u.email)[0].toUpperCase()}
                        </div>
                        <span className="admin-user-name">
                          {u.nome && u.cognome ? `${u.nome} ${u.cognome}` : '—'}
                        </span>
                      </div>
                    </td>
                    <td><span className="admin-user-email">{u.email}</span></td>
                    <td>
                      <span className={`user-menu-role user-menu-role--${u.ruolo}`}>
                        {ROLE_LABELS[u.ruolo] ?? u.ruolo}
                      </span>
                    </td>
                    <td><code className="admin-sub-badge">{u.cognito_sub.slice(0, 13)}...</code></td>
                    <td>
                      <span className="admin-date">
                        {new Date(u.created_at).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Creazione Utente */}
      {showModal && (
        <div className="auth-overlay" onClick={() => !isSubmitting && setShowModal(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="auth-modal-close"
              onClick={() => setShowModal(false)}
              disabled={isSubmitting}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="auth-modal-header">
              <div className="auth-modal-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="url(#logoGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
              </div>
              <h2 className="auth-modal-title">Crea Nuovo Utente</h2>
              <p className="auth-modal-subtitle">
                L'utente verrà registrato su AWS Cognito e riceverà la password temporanea via email.
              </p>
            </div>

            {formError && (
              <div className="auth-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{formError}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleCreateUser}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="admin-email">Email</label>
                <div className="auth-input-wrapper">
                  <input
                    type="email"
                    id="admin-email"
                    className="auth-input"
                    placeholder="nuovo@utente.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="admin-nome">Nome</label>
                  <div className="auth-input-wrapper">
                    <input
                      type="text"
                      id="admin-nome"
                      className="auth-input"
                      placeholder="Mario"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="admin-cognome">Cognome</label>
                  <div className="auth-input-wrapper">
                    <input
                      type="text"
                      id="admin-cognome"
                      className="auth-input"
                      placeholder="Rossi"
                      value={cognome}
                      onChange={(e) => setCognome(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="admin-ruolo">Ruolo del sistema</label>
                <div className="auth-input-wrapper" style={{ paddingRight: '12px' }}>
                  <select
                    id="admin-ruolo"
                    className="auth-input"
                    style={{ background: 'transparent', cursor: 'pointer' }}
                    value={ruolo}
                    onChange={(e) => setRuolo(e.target.value as RoleName)}
                    disabled={isSubmitting}
                  >
                    <option value="user" style={{ background: '#111827' }}>User (utente standard)</option>
                    <option value="organization_admin" style={{ background: '#111827' }}>Organization Admin</option>
                    <option value="super_admin" style={{ background: '#111827' }}>Super Admin</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isSubmitting}
                style={{ marginTop: '16px' }}
              >
                {isSubmitting ? (
                  <>
                    <span className="auth-btn-spinner" />
                    Creazione su Cognito...
                  </>
                ) : (
                  'Crea Utente su Cognito & DB'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
